const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeShadowHistory, promotionAssessment, allowedAutonomyClass } = require('../shadow-evaluation');

function successfulHistory(count = 20) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    before: 1,
    after: 2,
    outcome: 2,
    expected_direction: 'up',
    data_quality: 'high',
    attribution_confidence: 'high',
    safety_violation: false,
  }));
}

test('history summary calculates precision and false-positive rate', () => {
  const records = successfulHistory(19).concat([{ before: 2, after: 1, outcome: 1, expected_direction: 'up', data_quality: 'high', attribution_confidence: 'high' }]);
  const summary = summarizeShadowHistory(records);
  assert.equal(summary.evaluable_decisions, 20);
  assert.equal(summary.correct_decisions, 19);
  assert.equal(summary.false_positives, 1);
  assert.equal(summary.precision, 0.95);
  assert.equal(summary.false_positive_rate, 0.05);
  assert.equal(summary.writes_allowed, false);
});

test('promotion remains blocked on insufficient history', () => {
  const assessment = promotionAssessment(summarizeShadowHistory(successfulHistory(5)));
  assert.equal(assessment.candidate_for_supervised_low_risk, false);
  assert.ok(assessment.blockers.includes('insufficient_shadow_runs'));
  assert.equal(allowedAutonomyClass(assessment), 'observe_and_propose');
});

test('promotion candidate still cannot authorize spend, new campaigns or activation', () => {
  const assessment = promotionAssessment(summarizeShadowHistory(successfulHistory(20)));
  assert.equal(assessment.candidate_for_supervised_low_risk, true);
  assert.equal(assessment.spend_changes_authorized, false);
  assert.equal(assessment.new_campaigns_authorized, false);
  assert.equal(assessment.activation_authorized, false);
  assert.equal(assessment.writes_allowed, false);
  assert.equal(allowedAutonomyClass(assessment), 'supervised_reversible_candidate');
});

test('any safety violation blocks promotion', () => {
  const records = successfulHistory(20);
  records[0].safety_violation = true;
  const assessment = promotionAssessment(summarizeShadowHistory(records));
  assert.equal(assessment.candidate_for_supervised_low_risk, false);
  assert.ok(assessment.blockers.includes('safety_violation_history'));
});