const test = require("node:test");
const assert = require("node:assert/strict");
const {
  META_API_VERSION,
  buildPausedReservationDraft,
  metaCompatibilitySummary,
  assertPausedOnly,
} = require("../meta-paused-draft-next");

function validInput() {
  return {
    pageId: "101",
    instagramUserId: "202",
    sourceInstagramMediaId: "303",
    latitude: 52.5,
    longitude: 13.44,
    startsAt: "2026-08-24T15:00:00.000Z",
    dsaBeneficiary: "PARMA DI VINI BENEDETTI",
    dsaPayor: "PARMA DI VINI BENEDETTI",
  };
}

test("next Meta draft explicitly disables Advantage Audience", () => {
  const draft = buildPausedReservationDraft(validInput());
  assert.deepEqual(draft.adSet.targeting.targeting_automation, {
    advantage_audience: 0,
  });
  assert.doesNotThrow(() => assertPausedOnly(draft));
});

test("next Meta draft preserves DSA declarations and paused-only safety", () => {
  const draft = buildPausedReservationDraft(validInput());
  assert.equal(draft.adSet.dsa_beneficiary, "PARMA DI VINI BENEDETTI");
  assert.equal(draft.adSet.dsa_payor, "PARMA DI VINI BENEDETTI");
  assert.equal(draft.campaign.status, "PAUSED");
  assert.equal(draft.adSet.status, "PAUSED");
  assert.equal(draft.ad.status, "PAUSED");
});

test("compatibility summary pins the current Meta API generation", () => {
  assert.equal(META_API_VERSION, "v26.0");
  assert.deepEqual(metaCompatibilitySummary(), {
    api_version: "v26.0",
    paused_only: true,
    targeting_automation_explicit: true,
    advantage_audience: 0,
    known_error_addressed: 1870227,
  });
});
