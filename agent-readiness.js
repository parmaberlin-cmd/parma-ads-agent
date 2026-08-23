function clampScore(value, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(maximum, number));
}

function boolPoints(value, points) {
  return value === true ? points : 0;
}

function assessAgentReadiness({
  dataQuality = {},
  conversionIntegrity = {},
  safety = {},
  reliability = {},
  intelligence = {},
  operations = {},
} = {}) {
  const dimensions = {};

  dimensions.data = clampScore(
    boolPoints(dataQuality.sources_fresh, 8) +
      boolPoints(dataQuality.google_ready, 5) +
      boolPoints(dataQuality.meta_ready, 4) +
      boolPoints(dataQuality.ga4_ready, 4) +
      boolPoints(conversionIntegrity.trusted, 4),
    25
  );

  dimensions.safety = clampScore(
    boolPoints(safety.zero_write_default, 6) +
      boolPoints(safety.kill_switch_enforced, 5) +
      boolPoints(safety.idempotency_enforced, 4) +
      boolPoints(safety.human_approval_for_spend, 5) +
      boolPoints(safety.safe_orchestrator_mandatory, 5),
    25
  );

  dimensions.reliability = clampScore(
    boolPoints(reliability.last_known_good, 5) +
      boolPoints(reliability.concurrent_refresh_guard, 4) +
      boolPoints(reliability.fail_closed, 5) +
      boolPoints(reliability.regression_suite_green, 4) +
      boolPoints(reliability.post_action_verification_ready, 2),
    20
  );

  dimensions.intelligence = clampScore(
    boolPoints(intelligence.daily_manager, 4) +
      boolPoints(intelligence.anomaly_detection, 3) +
      boolPoints(intelligence.search_term_analysis, 3) +
      boolPoints(intelligence.funnel_diagnostics, 3) +
      boolPoints(intelligence.decision_journal, 2),
    15
  );

  dimensions.operations = clampScore(
    boolPoints(operations.google_live, 4) +
      boolPoints(operations.ga4_live, 4) +
      boolPoints(operations.meta_live, 4) +
      boolPoints(operations.runtime_health, 3),
    15
  );

  const score = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  const hardBlockers = [];

  if (!safety.zero_write_default) hardBlockers.push("zero_write_default_missing");
  if (!safety.kill_switch_enforced) hardBlockers.push("kill_switch_not_enforced");
  if (!safety.idempotency_enforced) hardBlockers.push("idempotency_not_enforced");
  if (!safety.human_approval_for_spend) hardBlockers.push("spend_approval_not_enforced");
  if (!safety.safe_orchestrator_mandatory) hardBlockers.push("safe_orchestrator_not_mandatory");
  if (!reliability.fail_closed) hardBlockers.push("fail_closed_not_verified");
  if (!reliability.regression_suite_green) hardBlockers.push("regression_suite_not_verified");
  if (!reliability.post_action_verification_ready) hardBlockers.push("post_action_verification_not_ready");
  if (!dataQuality.sources_fresh) hardBlockers.push("source_freshness_unverified");
  if (!conversionIntegrity.trusted) hardBlockers.push("conversion_integrity_untrusted");

  let stage = "foundation";
  if (score >= 60) stage = "shadow_operational";
  if (score >= 80 && hardBlockers.length === 0) stage = "supervised_candidate";

  return {
    score,
    maximum_score: 100,
    stage,
    dimensions,
    hard_blockers: hardBlockers,
    shadow_operation_allowed: score >= 60 && safety.zero_write_default === true && reliability.fail_closed === true,
    supervised_write_candidate: score >= 80 && hardBlockers.length === 0,
    execution_authorized: false,
    writes_allowed: false,
  };
}

function assertReadinessIsInformational(readiness) {
  if (readiness?.execution_authorized !== false || readiness?.writes_allowed !== false) {
    throw new Error("readiness score must never authorize execution");
  }
  return true;
}

module.exports = {
  assessAgentReadiness,
  assertReadinessIsInformational,
};
