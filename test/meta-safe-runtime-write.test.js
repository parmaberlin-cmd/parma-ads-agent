const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  executeRuntimePausedDraft,
  inspectExistingDraft,
} = require("../meta-safe-runtime-write");
const { APPROVAL_TOKEN } = require("../meta-paused-draft");

function explodingHttp() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    create() {
      return {
        get: async () => {
          calls += 1;
          throw new Error("network must not be used");
        },
        post: async () => {
          calls += 1;
          throw new Error("network must not be used");
        },
      };
    },
  };
}

test("disabled write gate blocks before any HTTP call", async () => {
  const http = explodingHttp();
  const result = await executeRuntimePausedDraft({
    env: { META_PAUSED_DRAFT_WRITES_ENABLED: "false" },
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
    approvalToken: APPROVAL_TOKEN,
    httpClient: http,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "write_gate_disabled");
  assert.equal(result.transport_used, false);
  assert.equal(http.calls, 0);
});

test("invalid approval token blocks before any HTTP call", async () => {
  const http = explodingHttp();
  const result = await executeRuntimePausedDraft({
    env: { META_PAUSED_DRAFT_WRITES_ENABLED: "true" },
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
    approvalToken: "wrong",
    httpClient: http,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "approval_token_invalid");
  assert.equal(http.calls, 0);
});

test("kill switch blocks before any HTTP call", async () => {
  const http = explodingHttp();
  const result = await executeRuntimePausedDraft({
    env: {
      META_PAUSED_DRAFT_WRITES_ENABLED: "true",
      META_PAUSED_DRAFT_KILL_SWITCH: "true",
    },
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
    approvalToken: APPROVAL_TOKEN,
    httpClient: http,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "kill_switch_enabled");
  assert.equal(http.calls, 0);
});

test("duplicate inspection refuses ambiguous or non-resumable campaigns", async () => {
  const draft = { campaign: { name: "draft", objective: "OUTCOME_TRAFFIC" } };
  const ambiguous = {
    get: async () => ({
      data: [
        { id: "1", name: "draft", status: "PAUSED", objective: "OUTCOME_TRAFFIC" },
        { id: "2", name: "draft", status: "PAUSED", objective: "OUTCOME_TRAFFIC" },
      ],
    }),
  };
  const first = await inspectExistingDraft(ambiguous, "act_1", draft);
  assert.equal(first.safe, false);
  assert.equal(first.blocker, "multiple_matching_paused_drafts");

  const active = {
    get: async () => ({
      data: [{ id: "1", name: "draft", status: "ACTIVE", objective: "OUTCOME_TRAFFIC" }],
    }),
  };
  const second = await inspectExistingDraft(active, "act_1", draft);
  assert.equal(second.safe, false);
  assert.equal(second.blocker, "matching_campaign_not_resumable");
});

test("duplicate scan follows pagination and catches a duplicate on a later page", async () => {
  const draft = { campaign: { name: "draft", objective: "OUTCOME_TRAFFIC" } };
  let page = 0;
  const transport = {
    async get(endpoint) {
      assert.equal(endpoint, "/act_1/campaigns");
      page += 1;
      if (page === 1) {
        return {
          data: [{ id: "9", name: "other", status: "PAUSED", objective: "OUTCOME_TRAFFIC" }],
          paging: { next: "yes", cursors: { after: "next" } },
        };
      }
      return {
        data: [
          { id: "1", name: "draft", status: "PAUSED", objective: "OUTCOME_TRAFFIC" },
          { id: "2", name: "draft", status: "PAUSED", objective: "OUTCOME_TRAFFIC" },
        ],
      };
    },
  };
  const result = await inspectExistingDraft(transport, "act_1", draft);
  assert.equal(page, 2);
  assert.equal(result.safe, false);
  assert.equal(result.blocker, "multiple_matching_paused_drafts");
});

test("bootstrap intercepts create route before legacy server and disables legacy one-shot", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "bootstrap.js"), "utf8");
  const routeIndex = source.indexOf("registerSafePausedDraftRoute(app");
  const serverIndex = source.indexOf('require("./server")');
  assert.ok(routeIndex >= 0);
  assert.ok(serverIndex > routeIndex);
  assert.ok(source.includes('process.env.META_PAUSED_DRAFT_ONE_SHOT = ""'));
});
