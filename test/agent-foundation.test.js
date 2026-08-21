const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assessConversionIntegrity,
  createDecisionJournalEntry,
  detectAnomalies,
  finalizeDecisionJournalEntry,
} = require("../agent-foundation");

test("conversion integrity is healthy when Google Ads and GA4 agree", () => {
  const result = assessConversionIntegrity({
    googleAdsConversions: 10,
    ga4Bookings: 9,
    googleLastSeenAt: "2026-08-21T10:00:00Z",
    ga4LastSeenAt: "2026-08-21T10:10:00Z",
    now: new Date("2026-08-21T12:00:00Z"),
  });

  assert.equal(result.status, "healthy");
  assert.equal(result.confidence, "high");
  assert.equal(result.optimization_allowed, true);
  assert.deepEqual(result.issues, []);
});

test("conversion optimization is blocked when one source is missing", () => {
  const result = assessConversionIntegrity({ googleAdsConversions: 4 });
  assert.equal(result.status, "unverified");
  assert.equal(result.optimization_allowed, false);
  assert.ok(result.issues.includes("ga4_booking_signal_missing"));
});

test("conversion source disagreement downgrades confidence", () => {
  const result = assessConversionIntegrity({ googleAdsConversions: 12, ga4Bookings: 3 });
  assert.equal(result.status, "degraded");
  assert.equal(result.confidence, "medium");
  assert.equal(result.optimization_allowed, false);
  assert.ok(result.issues.includes("conversion_sources_disagree"));
});

test("anomaly detector distinguishes access failure and marketing anomaly", () => {
  const anomalies = detectAnomalies({
    current: { spend: 20, clicks: 0, delivery_active: true },
    baseline: { spend: 30, impressions: 1500 },
    access: { google_ok: false, meta_ok: true },
  });

  assert.equal(anomalies[0].code, "GOOGLE_ACCESS_FAILURE");
  assert.equal(anomalies[0].severity, "critical");
  assert.ok(anomalies.some((item) => item.code === "SPEND_WITHOUT_CLICKS"));
});

test("anomaly detector flags conversion collapse and CPC spike", () => {
  const anomalies = detectAnomalies({
    current: { clicks: 8, conversions: 0, cpc: 2.1 },
    baseline: { conversions: 5, cpc: 1.0 },
  });
  assert.ok(anomalies.some((item) => item.code === "CONVERSION_COLLAPSE"));
  assert.ok(anomalies.some((item) => item.code === "CPC_SPIKE"));
});

test("decision journal requires enough evidence to be auditable", () => {
  assert.throws(
    () => createDecisionJournalEntry({ channel: "meta" }),
    /channel, diagnosis and proposedAction are required/
  );

  const entry = createDecisionJournalEntry({
    timestamp: "2026-08-21T12:00:00Z",
    channel: "meta",
    evidenceWindow: "last_7d",
    evidence: { clicks: 20, bookings: 0 },
    dataQuality: "validated",
    diagnosis: "Clicks without bookings",
    confidence: "high",
    expectedEffect: "Reduce wasted traffic",
    proposedAction: "Inspect booking funnel before adding spend",
    requiresAuthorization: false,
  });

  assert.equal(entry.data_quality, "validated");
  assert.equal(entry.requires_authorization, false);
  assert.equal(entry.execution, null);
});

test("decision journal can append execution verification and outcome", () => {
  const entry = createDecisionJournalEntry({
    channel: "google",
    diagnosis: "Search term waste",
    proposedAction: "Add negative keyword after approval",
    requiresAuthorization: true,
  });
  const finalized = finalizeDecisionJournalEntry(entry, {
    execution: { status: "completed" },
    verification: { external_state_confirmed: true },
    outcome: { status: "measurement_pending" },
  });

  assert.equal(finalized.execution.status, "completed");
  assert.equal(finalized.verification.external_state_confirmed, true);
  assert.equal(finalized.outcome.status, "measurement_pending");
});
