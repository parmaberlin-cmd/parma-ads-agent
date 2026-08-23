const test = require("node:test");
const assert = require("node:assert/strict");
const { convertDailyWindow } = require("../meta-timezone-schedule");
const { buildPausedReservationDraft } = require("../meta-paused-draft-next");

test("Berlin 17-23 becomes Los Angeles 08-14 in late August", () => {
  const result = convertDailyWindow({
    startsAt: "2026-08-24T15:00:00.000Z",
    durationDays: 14,
    sourceTimeZone: "Europe/Berlin",
    targetTimeZone: "America/Los_Angeles",
  });
  assert.equal(result.safe, true);
  assert.equal(result.start_minute, 8 * 60);
  assert.equal(result.end_minute, 14 * 60);
  assert.equal(result.day_shift, 0);
});

test("timezone conversion fails closed across unstable DST offset periods", () => {
  const result = convertDailyWindow({
    startsAt: "2026-10-25T16:00:00.000Z",
    durationDays: 14,
    sourceTimeZone: "Europe/Berlin",
    targetTimeZone: "America/Los_Angeles",
  });
  assert.equal(result.safe, false);
  assert.equal(result.reason, "timezone_offset_changes_during_campaign");
});

test("paused draft uses converted account-timezone schedule", () => {
  const draft = buildPausedReservationDraft({
    pageId: "1",
    instagramUserId: "2",
    sourceInstagramMediaId: "3",
    latitude: 52.499492,
    longitude: 13.4399793,
    dailyBudgetEur: 6,
    durationDays: 14,
    startsAt: "2026-08-24T15:00:00.000Z",
    dsaBeneficiary: "Parma",
    dsaPayor: "Parma",
    accountTimezone: "America/Los_Angeles",
    businessTimezone: "Europe/Berlin",
  });
  assert.equal(draft.adSet.adset_schedule[0].start_minute, 480);
  assert.equal(draft.adSet.adset_schedule[0].end_minute, 840);
  assert.equal(draft.policy.schedule.stable_for_campaign, true);
  assert.equal(draft.adSet.status, "PAUSED");
});
