const test = require("node:test");
const assert = require("node:assert/strict");
const { executePausedMetaDraftSafely } = require("../meta-safe-orchestrator");
const { AUTONOMY_LEVELS } = require("../safe-execution");
const { APPROVAL_TOKEN } = require("../meta-paused-draft");

const validDraft = {
  campaign: {
    name: "x",
    status: "PAUSED",
    objective: "OUTCOME_TRAFFIC",
    special_ad_categories: [],
  },
  adSet: {
    name: "x",
    status: "PAUSED",
    lifetime_budget: 8400,
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    targeting: {
      publisher_platforms: ["instagram"],
      geo_locations: { countries: ["DE"] },
    },
    dsa_beneficiary: "Parma",
    dsa_payor: "Parma",
  },
  creative: {
    name: "x",
    object_id: "1",
    instagram_user_id: "2",
    source_instagram_media_id: "3",
  },
  ad: { name: "x", status: "PAUSED" },
  policy: { may_activate: false },
};

function fakeTransport() {
  let posts = 0;
  let nextId = 100;
  return {
    get posts() {
      return posts;
    },
    async get() {
      return { status: "PAUSED", effective_status: "PAUSED" };
    },
    async post() {
      posts += 1;
      nextId += 1;
      return { id: String(nextId) };
    },
  };
}

test("write gate blocks before any transport write", async () => {
  const transport = fakeTransport();
  const result = await executePausedMetaDraftSafely({
    transport,
    adAccountId: "act_1",
    draft: validDraft,
    approvalToken: APPROVAL_TOKEN,
    writeGateEnabled: false,
  });
  assert.equal(result.blocked, true);
  assert.equal(transport.posts, 0);
  assert.ok(result.preflight.level_1_readiness.blockers.includes("write_gate_enabled"));
});

test("wrong approval token blocks before any transport write", async () => {
  const transport = fakeTransport();
  const result = await executePausedMetaDraftSafely({
    transport,
    adAccountId: "act_1",
    draft: validDraft,
    approvalToken: "wrong",
    writeGateEnabled: true,
  });
  assert.equal(result.blocked, true);
  assert.equal(transport.posts, 0);
  assert.ok(result.preflight.level_1_readiness.blockers.includes("approval_token_ok"));
});

test("kill switch blocks before any transport write", async () => {
  const transport = fakeTransport();
  const result = await executePausedMetaDraftSafely({
    transport,
    adAccountId: "act_1",
    draft: validDraft,
    approvalToken: APPROVAL_TOKEN,
    writeGateEnabled: true,
    killSwitch: true,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "kill_switch_enabled");
  assert.equal(transport.posts, 0);
});

test("recommend level cannot write even when preflight is otherwise ready", async () => {
  const transport = fakeTransport();
  const result = await executePausedMetaDraftSafely({
    transport,
    adAccountId: "act_1",
    draft: validDraft,
    approvalToken: APPROVAL_TOKEN,
    writeGateEnabled: true,
    autonomyLevel: AUTONOMY_LEVELS.RECOMMEND,
  });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "write_not_allowed_at_level");
  assert.equal(transport.posts, 0);
});

test("safe-write level can create only PAUSED objects after complete preflight", async () => {
  const transport = fakeTransport();
  const result = await executePausedMetaDraftSafely({
    transport,
    adAccountId: "act_1",
    draft: validDraft,
    approvalToken: APPROVAL_TOKEN,
    writeGateEnabled: true,
    autonomyLevel: AUTONOMY_LEVELS.SAFE_WRITE,
  });
  assert.equal(result.success, true);
  assert.equal(result.activates_spend, false);
  assert.equal(transport.posts, 4);
  assert.equal(result.preflight.ready, true);
  assert.ok(Object.values(result.verification).every((object) => object.status === "PAUSED"));
});
