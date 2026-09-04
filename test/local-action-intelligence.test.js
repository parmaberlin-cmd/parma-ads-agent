const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyLocalAction, buildWalkInMeasurementState } = require('../local-action-intelligence');

test('directions are visit intent but not a verified walk in', () => {
  const out = classifyLocalAction({ action:'directions' });
  assert.equal(out.business_outcome, 'probable_visit_signal');
  assert.equal(out.verified_customer, false);
});

test('missing walk-in ground truth protects local intent from conversion-only pruning', () => {
  const out = buildWalkInMeasurementState({ directions:20, phone:4 });
  assert.equal(out.verified_walk_ins, null);
  assert.equal(out.protect_local_intent_from_conversion_only_pruning, true);
  assert.equal(out.negative_keyword_permission, false);
});

test('known walk-ins still do not authorize targeting changes', () => {
  const out = buildWalkInMeasurementState({ directions:20, phone:4, verified_walk_ins:7 });
  assert.equal(out.walk_in_measurement_complete, true);
  assert.equal(out.targeting_change_permission, false);
  assert.equal(out.writes_allowed, false);
});
