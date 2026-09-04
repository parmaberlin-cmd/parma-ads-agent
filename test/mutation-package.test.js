const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMutationPackage } = require('../mutation-package');

test('builds simulation-only package with independent permission gates', () => {
  const out = buildMutationPackage({
    entity:'keyword:beste pizza berlin',
    proposed_change:'consolidate overlapping routing',
    evidence:['cross-ad-group overlap observed'],
    expected_effect:'clearer query-to-ad-group mapping',
    risk:'medium',
    permission_class:'YELLOW',
    success_threshold:'improved routing without traffic loss',
    failure_threshold:'material eligible-traffic loss',
    observation_period:'14 mature days',
    rollback:'restore previous keyword/ad-group state',
  });
  assert.equal(out.mode, 'simulation_only');
  assert.equal(out.permission_class, 'YELLOW');
  assert.equal(out.writes_authorized, false);
  assert.equal(out.execution_authorized, false);
  assert.equal(out.spend_authorized, false);
});

test('fails closed when permission class or rollback is missing', () => {
  assert.throws(() => buildMutationPackage({entity:'x',proposed_change:'y',permission_class:'BLUE',rollback:'z'}), /permission_class/);
  assert.throws(() => buildMutationPackage({entity:'x',proposed_change:'y',permission_class:'RED'}), /rollback/);
});
