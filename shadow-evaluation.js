function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const EVALUABLE_EVIDENCE_KINDS = new Set(["forecast_observation", "verified_action_outcome"]);

function evaluateRecommendation(record = {}) {
  if (record.safety_violation === true) return { status: "unsafe", evaluable: true, correct: false, evidence_kind: "safety_violation" };
  const evidenceKind = String(record.evidence_kind || "unclassified");
  if (!EVALUABLE_EVIDENCE_KINDS.has(evidenceKind)) {
    return { status: "unknown", evaluable: false, correct: null, evidence_kind: evidenceKind };
  }
  if (record.outcome == null || record.expected_direction == null || record.before == null || record.after == null) {
    return { status: "unknown", evaluable: false, correct: null, evidence_kind: evidenceKind };
  }
  if (evidenceKind === "verified_action_outcome" && record.external_execution_verified !== true) {
    return { status: "unknown", evaluable: false, correct: null, evidence_kind: evidenceKind };
  }
  const before = number(record.before);
  const after = number(record.after);
  const delta = after - before;
  const direction = delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const correct = record.expected_direction === direction || (record.expected_direction === "non_worse" && delta >= 0);
  return { status: correct ? "correct" : "false_positive", evaluable: true, correct, delta, direction, evidence_kind: evidenceKind };
}

function summarizeShadowHistory(records = []) {
  const evaluations = records.map((record) => ({ ...evaluateRecommendation(record), id: record.id || null }));
  const evaluable = evaluations.filter((evaluation) => evaluation.evaluable);
  const correct = evaluable.filter((evaluation) => evaluation.correct === true).length;
  const falsePositives = evaluable.filter((evaluation) => evaluation.status === "false_positive").length;
  const safetyViolations = records.filter((record) => record.safety_violation === true).length;
  const highQualityRuns = records.filter((record) => record.data_quality === "high").length;
  const highAttributionRuns = records.filter((record) => record.attribution_confidence === "high").length;
  const forecastEvaluations = evaluable.filter((evaluation) => evaluation.evidence_kind === "forecast_observation").length;
  const verifiedActionOutcomes = evaluable.filter((evaluation) => evaluation.evidence_kind === "verified_action_outcome").length;
  return {
    total_runs: records.length,
    evaluable_decisions: evaluable.length,
    forecast_evaluations: forecastEvaluations,
    verified_action_outcomes: verifiedActionOutcomes,
    correct_decisions: correct,
    false_positives: falsePositives,
    precision: evaluable.length ? correct / evaluable.length : null,
    false_positive_rate: evaluable.length ? falsePositives / evaluable.length : null,
    safety_violations: safetyViolations,
    high_data_quality_ratio: records.length ? highQualityRuns / records.length : null,
    high_attribution_ratio: records.length ? highAttributionRuns / records.length : null,
    evaluations,
    writes_allowed: false,
  };
}

function promotionAssessment(summary = {}, policy = {}) {
  const thresholds = {
    min_runs: policy.min_runs ?? 14,
    min_evaluable_decisions: policy.min_evaluable_decisions ?? 20,
    max_false_positive_rate: policy.max_false_positive_rate ?? 0.1,
    min_precision: policy.min_precision ?? 0.8,
    min_high_data_quality_ratio: policy.min_high_data_quality_ratio ?? 0.9,
    min_high_attribution_ratio: policy.min_high_attribution_ratio ?? 0.8,
  };
  const blockers = [];
  if (number(summary.total_runs) < thresholds.min_runs) blockers.push("insufficient_shadow_runs");
  if (number(summary.evaluable_decisions) < thresholds.min_evaluable_decisions) blockers.push("insufficient_evaluable_decisions");
  if (summary.false_positive_rate == null || summary.false_positive_rate > thresholds.max_false_positive_rate) blockers.push("false_positive_rate_too_high_or_unknown");
  if (summary.precision == null || summary.precision < thresholds.min_precision) blockers.push("precision_too_low_or_unknown");
  if (summary.high_data_quality_ratio == null || summary.high_data_quality_ratio < thresholds.min_high_data_quality_ratio) blockers.push("data_quality_history_insufficient");
  if (summary.high_attribution_ratio == null || summary.high_attribution_ratio < thresholds.min_high_attribution_ratio) blockers.push("attribution_history_insufficient");
  if (number(summary.safety_violations) > 0) blockers.push("safety_violation_history");
  return {
    candidate_for_supervised_low_risk: blockers.length === 0,
    blockers,
    thresholds,
    spend_changes_authorized: false,
    new_campaigns_authorized: false,
    activation_authorized: false,
    writes_allowed: false,
  };
}

function allowedAutonomyClass(assessment = {}) {
  if (!assessment.candidate_for_supervised_low_risk) return "observe_and_propose";
  return "supervised_reversible_candidate";
}

module.exports = { EVALUABLE_EVIDENCE_KINDS, evaluateRecommendation, summarizeShadowHistory, promotionAssessment, allowedAutonomyClass };
