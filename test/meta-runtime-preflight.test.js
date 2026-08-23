const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeAccountId,
  parseFutureStart,
  runtimeConfig,
  inspectAccountContext,
  validateScheduleForAccount,
  executeRuntimeMetaPreflight,
} = require("../meta-runtime-preflight");

test("normalizes Meta account ids safely", () => {
  assert.equal(normalizeAccountId("123"), "act_123");
  assert.equal(normalizeAccountId("act_456"), "act_456");
  assert.equal(normalizeAccountId("bad"), null);
});

test("requires a future start time", () => {
  const now = Date.parse("2026-08-23T10:00:00Z");
  assert.equal(parseFutureStart("2026-08-23T10:10:00Z", now), null);
  assert.equal(parseFutureStart("2026-08-23T11:00:00Z", now), "2026-08-23T11:00:00.000Z");
});

test("runtime config keeps writes behind the explicit gate", () => {
  const config = runtimeConfig({
    META_ACCESS_TOKEN: "x",
    META_AD_ACCOUNT_ID: "123",
    META_PAUSED_DRAFT_WRITES_ENABLED: "false",
  });
  assert.equal(config.adAccountId, "act_123");
  assert.equal(config.writeGateEnabled, false);
  assert.equal(config.businessTimezone, "Europe/Berlin");
  assert.equal(config.expectedTimezone, "Europe/Berlin");
  assert.equal(config.expectedCurrency, "EUR");
});

test("Berlin EUR account needs no schedule conversion", async () => {
  const transport = { get: async () => ({ account_status: 1, currency: "EUR", timezone_name: "Europe/Berlin" }) };
  const result = await inspectAccountContext(transport, {
    adAccountId: "act_1",
    businessTimezone: "Europe/Berlin",
    expectedCurrency: "EUR",
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.timezone_match, true);
  assert.equal(result.schedule_conversion_required, false);
  assert.equal(result.currency_match, true);
});

test("different account timezone is schedulable context, not a blocker", async () => {
  const transport = { get: async () => ({ account_status: 1, currency: "EUR", timezone_name: "America/Los_Angeles" }) };
  const result = await inspectAccountContext(transport, {
    adAccountId: "act_1",
    businessTimezone: "Europe/Berlin",
    expectedCurrency: "EUR",
  });
  assert.equal(result.blockers.includes("account_timezone_mismatch"), false);
  assert.equal(result.timezone_match, false);
  assert.equal(result.schedule_conversion_required, true);
});

test("account currency mismatch still blocks readiness", async () => {
  const transport = { get: async () => ({ account_status: 1, currency: "USD", timezone_name: "Europe/Berlin" }) };
  const result = await inspectAccountContext(transport, {
    adAccountId: "act_1",
    businessTimezone: "Europe/Berlin",
    expectedCurrency: "EUR",
  });
  assert.ok(result.blockers.includes("account_currency_mismatch"));
});

test("stable Berlin to Los Angeles schedule is accepted", () => {
  const result = validateScheduleForAccount({
    start: "2026-08-24T15:00:00.000Z",
    durationDays: 14,
    account: { timezone_name: "America/Los_Angeles" },
    businessTimezone: "Europe/Berlin",
  });
  assert.equal(result.safe, true);
  assert.equal(result.converted, true);
});

test("DST offset instability fails closed before Meta asset inspection", () => {
  const result = validateScheduleForAccount({
    start: "2026-10-25T16:00:00.000Z",
    durationDays: 14,
    account: { timezone_name: "America/Los_Angeles" },
    businessTimezone: "Europe/Berlin",
  });
  assert.equal(result.safe, false);
  assert.equal(result.reason, "timezone_offset_changes_during_campaign");
});

test("incomplete runtime config fails closed without HTTP calls", async () => {
  let calls = 0;
  const fake = {
    create() {
      return {
        get: async () => {
          calls += 1;
          throw new Error("should not call");
        },
      };
    },
  };
  const result = await executeRuntimeMetaPreflight({
    env: {},
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
    httpClient: fake,
  });
  assert.equal(result.ready, false);
  assert.equal(result.may_spend, false);
  assert.equal(calls, 0);
  assert.ok(result.blockers.includes("configuration_incomplete"));
});
