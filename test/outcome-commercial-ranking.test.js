const test = require('node:test');
const assert = require('node:assert/strict');
const { rankVerifiedOutcomes } = require('../outcome-commercial-ranking');

test('unverified outcomes are excluded rather than treated as zero value', () => {
  const out = rankVerifiedOutcomes([{ outcome:'walk_in', contribution_value:10, expected_incremental_customers:5, measurement_verified:false, incrementality_verified:false }]);
  assert.equal(out.ranked.length, 0);
  assert.equal(out.excluded.length, 1);
  assert.equal(out.mixed_evidence_never_coerced_to_zero, true);
});

test('verified outcomes rank by expected incremental contribution', () => {
  const out = rankVerifiedOutcomes([
    { outcome:'reservation', contribution_value:8, expected_incremental_customers:4, measurement_verified:true, incrementality_verified:true },
    { outcome:'direct_order', contribution_value:6, expected_incremental_customers:8, measurement_verified:true, incrementality_verified:true },
  ]);
  assert.equal(out.ranked[0].outcome, 'direct_order');
  assert.equal(out.ranked[0].expected_incremental_contribution, 48);
  assert.equal(out.execution_authorized, false);
  assert.equal(out.spend_authorized, false);
});
