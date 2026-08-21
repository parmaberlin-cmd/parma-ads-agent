const test = require("node:test");
const assert = require("node:assert/strict");

const { assessConversionIntegrity, detectAnomalies, createDecisionJournalEntry } = require("../agent-foundation");
const { analyzeSearchTerms } = require("../acquisition-intelligence");
const { recommendBudget, assessFunnel, buildDailyManager } = require("../optimization-manager");
const { classifyAction, verifyPostAction } = require("../safety-experiments");
const { estimateBusinessValue, evaluateAgentDecision } = require("../business-ops-evaluation");

test("untrusted conversions block optimization escalation across modules", () => {
  const integrity = assessConversionIntegrity({ googleAdsConversions: 0, ga4Bookings: 5 });
  assert.equal(integrity.optimization_allowed, false);

  const [budget] = recommendBudget([{ spend_eur: 20, conversions: 5, target_cpa_eur: 10 }]);
  assert.equal(budget.recommendation, "increase");

  const evaluation = evaluateAgentDecision({
    scenario: { requires_conversion_integrity: true },
    decision: { action: "increase_budget", conversion_integrity: integrity.status },
  });
  assert.equal(evaluation.passed, false);
  assert.ok(evaluation.failures.includes("optimized_on_untrusted_conversions"));
});

test("broken funnel outranks lower-value acquisition recommendations", () => {
  const funnel = assessFunnel({ landingAvailable: false, adClicks: 20, landingViews: 0, conversionIntegrity: "degraded" });
  const recs = analyzeSearchTerms([{ search_term: "cheap pizza", clicks: 8, cost_eur: 9, conversions: 0, match_type: "broad" }]);
  const daily = buildDailyManager({ recommendations: recs, funnel });
  assert.equal(daily.primary_priorities[0].code, "LANDING_UNAVAILABLE");
});

test("unknown or unsafe writes fail closed and post-action state must verify", () => {
  assert.equal(classifyAction({ type: "mystery_write" }).decision, "blocked");
  assert.equal(classifyAction({ type: "activate_campaign" }).decision, "approval_required");
  const verification = verifyPostAction({ expected: { status: "PAUSED" }, actual: { status: "ACTIVE" } });
  assert.equal(verification.verified, false);
});

test("decision journal and business value can record a measured safe outcome", () => {
  const value = estimateBusinessValue({ spendEur: 20, bookings: 3, avgPartySize: 2, avgSpendPerGuestEur: 24 });
  const entry = createDecisionJournalEntry({
    channel: "google",
    evidenceWindow: "24h",
    evidence: value,
    dataQuality: "healthy",
    diagnosis: "qualified bookings observed",
    confidence: "medium",
    expectedEffect: "preserve efficient demand capture",
    proposedAction: "keep budget",
    requiresAuthorization: false,
  });
  assert.equal(entry.evidence.estimated_revenue_eur, 144);
  assert.equal(entry.requires_authorization, false);
});

test("anomaly evidence reaches Daily Manager with critical priority", () => {
  const anomalies = detectAnomalies({ current: { spend: 20, clicks: 0 }, baseline: { spend: 30 }, access: { google_ok: false } });
  const daily = buildDailyManager({ anomalies });
  assert.equal(daily.primary_priorities[0].code, "GOOGLE_ACCESS_FAILURE");
  assert.equal(daily.primary_priorities[0].severity, "critical");
});
