const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateRecommendation, summarizeShadowHistory, promotionAssessment, allowedAutonomyClass } = require("../shadow-evaluation");

function successfulHistory(count = 20) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    evidence_kind: "forecast_observation",
    before: 1,
    after: 2,
    outcome: 2,
    expected_direction: "up",
    data_quality: "high",
    attribution_confidence: "high",
    safety_violation: false,
  }));
}

test("history summary calculates precision only from explicitly classified evidence", () => {
  const records = successfulHistory(19).concat([{ evidence_kind: "forecast_observation", before: 2, after: 1, outcome: 1, expected_direction: "up", data_quality: "high", attribution_confidence: "high" }]);
  const summary = summarizeShadowHistory(records);
  assert.equal(summary.evaluable_decisions, 20);
  assert.equal(summary.forecast_evaluations, 20);
  assert.equal(summary.verified_action_outcomes, 0);
  assert.equal(summary.correct_decisions, 19);
  assert.equal(summary.false_positives, 1);
  assert.equal(summary.precision, 0.95);
  assert.equal(summary.false_positive_rate, 0.05);
  assert.equal(summary.writes_allowed, false);
});

test("legacy or unclassified before-after records cannot inflate readiness", () => {
  const evaluation = evaluateRecommendation({ before: 1, after: 2, outcome: 2, expected_direction: "up" });
  assert.equal(evaluation.evaluable, false);
  assert.equal(evaluation.evidence_kind, "unclassified");
});

test("verified action outcomes require explicit external execution verification", () => {
  const record = { evidence_kind: "verified_action_outcome", before: 1, after: 2, outcome: 2, expected_direction: "up" };
  assert.equal(evaluateRecommendation(record).evaluable, false);
  assert.equal(evaluateRecommendation({ ...record, external_execution_verified: true }).evaluable, true);
});

test("promotion remains blocked on insufficient history", () => {
  const assessment = promotionAssessment(summarizeShadowHistory(successfulHistory(5)));
  assert.equal(assessment.candidate_for_supervised_low_risk, false);
  assert.ok(assessment.blockers.includes("insufficient_shadow_runs"));
  assert.equal(allowedAutonomyClass(assessment), "observe_and_propose");
});

test("promotion candidate still cannot authorize spend, new campaigns or activation", () => {
  const assessment = promotionAssessment(summarizeShadowHistory(successfulHistory(20)));
  assert.equal(assessment.candidate_for_supervised_low_risk, true);
  assert.equal(assessment.spend_changes_authorized, false);
  assert.equal(assessment.new_campaigns_authorized, false);
  assert.equal(assessment.activation_authorized, false);
  assert.equal(assessment.writes_allowed, false);
  assert.equal(allowedAutonomyClass(assessment), "supervised_reversible_candidate");
});

test("any safety violation blocks promotion", () => {
  const records = successfulHistory(20);
  records[0].safety_violation = true;
  const assessment = promotionAssessment(summarizeShadowHistory(records));
  assert.equal(assessment.candidate_for_supervised_low_risk, false);
  assert.ok(assessment.blockers.includes("safety_violation_history"));
});
