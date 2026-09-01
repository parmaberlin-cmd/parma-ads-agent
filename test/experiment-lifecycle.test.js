const test = require('node:test');
const assert = require('node:assert/strict');
const { learningFreshness, evaluateExperimentLifecycle } = require('../experiment-lifecycle');

test('old conclusions expire instead of becoming permanent truth', () => {
  const out = learningFreshness({ concluded_at:'2026-07-01T00:00:00Z', now:'2026-09-02T00:00:00Z', ttl_days:30 });
  assert.equal(out.fresh, false);
  assert.equal(out.reason, 'expired_learning');
});

test('experiment cannot be judged before observation and measurement mature', () => {
  const out = evaluateExperimentLifecycle({ state:'observing', observation_started_at:'2026-09-01T00:00:00Z', observation_ends_at:'2026-09-08T00:00:00Z', now:'2026-09-02T00:00:00Z', evidence_mature:false, measurement_verified:false, rollback:'restore prior assets' });
  assert.equal(out.outcome_judgment_allowed, false);
  assert.equal(out.continue_observation, true);
  assert.equal(out.execution_authorized, false);
});

test('mature completed observation can be judged but does not self-authorize writes', () => {
  const out = evaluateExperimentLifecycle({ state:'observing', observation_started_at:'2026-08-20T00:00:00Z', observation_ends_at:'2026-08-30T00:00:00Z', now:'2026-09-02T00:00:00Z', evidence_mature:true, measurement_verified:true, rollback:'restore prior assets' });
  assert.equal(out.outcome_judgment_allowed, true);
  assert.equal(out.writes_allowed, false);
});

test('stop condition only becomes rollback-ready when rollback is defined', () => {
  const out = evaluateExperimentLifecycle({ state:'observing', stop_condition_met:true });
  assert.equal(out.stop_supported, true);
  assert.equal(out.rollback_ready, false);
});
