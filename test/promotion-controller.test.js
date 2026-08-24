const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPromotionDecision, assertPromotionFailClosed } = require("../promotion-controller");

function strongReadinessInput() {
  return {
    dataQuality: { sources_fresh: true, google_ready: true, meta_ready: true, ga4_ready: true },
    conversionIntegrity: { trusted: true },
    safety: { zero_write_default: true, kill_switch_enforced: true, idempotency_enforced: true, human_approval_for_spend: true, safe_orchestrator_mandatory: true },
    reliability: { last_known_good: true, concurrent_refresh_guard: true, fail_closed: true, regression_suite_green: true, post_action_verification_ready: true },
    intelligence: { daily_manager: true, anomaly_detection: true, search_term_analysis: true, funnel_diagnostics: true, decision_journal: true },
    operations: { google_live: true, ga4_live: true, meta_live: true, runtime_health: true },
  };
}

function strongLiveInput() {
  return {
    google: { basic_access: true, credentials_configured: true },
    ga4: { configured: true },
    meta: { preflight_ready: true },
    shadow: { deploy_success: true, read_only_verified: true },
  };
}

function strongHistory(count = 20) {
  return Array.from({ length: count }, (_, index) => ({
    id: `run-${index + 1}`,
    evidence_kind: "forecast_observation",
    before: 10,
    after: 11,
    outcome: "observed",
    expected_direction: "up",
    data_quality: "high",
    attribution_confidence: "high",
    safety_violation: false,
  }));
}

test("all three gates can nominate only supervised reversible autonomy", () => {
  const decision = buildPromotionDecision({ readinessInput: strongReadinessInput(), liveValidationInput: strongLiveInput(), shadowRecords: strongHistory() });
  assert.equal(decision.promotion_ready, true);
  assert.equal(decision.autonomy_class, "supervised_reversible_candidate");
  assert.deepEqual(decision.gates, { readiness: true, live_validation: true, shadow_history: true });
  assert.equal(decision.internal_reversible_candidate, true);
  assert.equal(decision.external_write_authorized, false);
  assert.equal(decision.spend_authorized, false);
  assert.equal(decision.campaign_creation_authorized, false);
  assert.equal(decision.activation_authorized, false);
  assert.equal(decision.execution_authorized, false);
  assert.equal(decision.writes_allowed, false);
  assert.equal(assertPromotionFailClosed(decision), true);
});

test("high readiness score cannot override missing live validation", () => {
  const live = strongLiveInput();
  live.meta.preflight_ready = false;
  const decision = buildPromotionDecision({ readinessInput: strongReadinessInput(), liveValidationInput: live, shadowRecords: strongHistory() });
  assert.equal(decision.gates.readiness, true);
  assert.equal(decision.gates.shadow_history, true);
  assert.equal(decision.gates.live_validation, false);
  assert.equal(decision.promotion_ready, false);
  assert.equal(decision.autonomy_class, "observe_and_propose");
  assert.ok(decision.blockers.includes("live:meta_preflight_ready"));
});

test("live validation cannot override insufficient Shadow history", () => {
  const decision = buildPromotionDecision({ readinessInput: strongReadinessInput(), liveValidationInput: strongLiveInput(), shadowRecords: [] });
  assert.equal(decision.gates.readiness, true);
  assert.equal(decision.gates.live_validation, true);
  assert.equal(decision.gates.shadow_history, false);
  assert.equal(decision.promotion_ready, false);
  assert.ok(decision.blockers.includes("history:insufficient_shadow_runs"));
  assert.ok(decision.blockers.includes("history:insufficient_evaluable_decisions"));
});

test("one safety violation blocks promotion regardless of otherwise strong history", () => {
  const history = strongHistory();
  history[0].safety_violation = true;
  const decision = buildPromotionDecision({ readinessInput: strongReadinessInput(), liveValidationInput: strongLiveInput(), shadowRecords: history });
  assert.equal(decision.promotion_ready, false);
  assert.ok(decision.blockers.includes("history:safety_violation_history"));
  assert.equal(decision.external_write_authorized, false);
});

test("weak architecture readiness blocks promotion even with perfect live/history evidence", () => {
  const readiness = strongReadinessInput();
  readiness.safety.kill_switch_enforced = false;
  const decision = buildPromotionDecision({ readinessInput: readiness, liveValidationInput: strongLiveInput(), shadowRecords: strongHistory() });
  assert.equal(decision.promotion_ready, false);
  assert.ok(decision.blockers.includes("readiness:kill_switch_not_enforced"));
  assert.equal(decision.autonomy_class, "observe_and_propose");
});
