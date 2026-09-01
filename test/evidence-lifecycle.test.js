const test = require('node:test');
const assert = require('node:assert/strict');
const { evidenceFreshness, recommendationState, maturityState } = require('../evidence-lifecycle');

test('stale evidence is identified', () => {
  const x = evidenceFreshness({ observed_at:'2026-08-01T00:00:00Z', now:'2026-09-01T00:00:00Z', max_age_hours:48 });
  assert.equal(x.fresh, false);
  assert.equal(x.status, 'stale');
});

test('recommendation cannot become execution permission', () => {
  const x = recommendationState({ created_at:'2026-09-01T00:00:00Z', now:'2026-09-01T12:00:00Z', evidence_fresh:true, measurement_verified:true });
  assert.equal(x.valid, true);
  assert.equal(x.execution_authorized, false);
});

test('recent reporting window can be marked immature', () => {
  const x = maturityState({ window_end:'2026-09-01T00:00:00Z', now:'2026-09-02T00:00:00Z', minimum_lag_hours:72 });
  assert.equal(x.mature, false);
});
