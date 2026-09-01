const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOutcomeEvidence } = require('../measurement-contract');

const base = {
  semantic_identity_verified:true,
  exact_date_window:true,
  timezone:'Europe/Berlin',
  date_basis:'created_date',
  counting_rule:'one_per_business_object',
  dedupe_rule:'stable_business_object_id',
  maturity_verified:true,
};

test('reservation requires reservation-system ground truth and cancellation semantics', () => {
  const out = validateOutcomeEvidence({ ...base, outcome:'reservation_completed', ground_truth_source:'reservation_system' });
  assert.ok(out.blockers.includes('cancellation_policy_missing'));
  assert.equal(out.optimization_allowed, false);
});

test('verified reservation evidence can clear measurement gate without authorizing execution', () => {
  const out = validateOutcomeEvidence({ ...base, outcome:'reservation_completed', ground_truth_source:'reservation_system', cancellation_policy:'count_created_and_report_later_cancelled_separately' });
  assert.equal(out.valid, true);
  assert.equal(out.optimization_allowed, true);
  assert.equal(out.writes_allowed, false);
  assert.equal(out.execution_authorized, false);
});

test('direct orders remain distinct from marketplace orders', () => {
  const out = validateOutcomeEvidence({ ...base, outcome:'direct_order_completed', ground_truth_source:'marketplace_order_system', refund_policy:'report_refunds_separately' });
  assert.ok(out.blockers.includes('ground_truth_missing_or_wrong_source'));
});

test('probable walk in can never become verified conversion ground truth', () => {
  const out = validateOutcomeEvidence({ ...base, outcome:'probable_walk_in' });
  assert.ok(out.blockers.includes('outcome_not_directly_verified'));
  assert.equal(out.optimization_allowed, false);
});
