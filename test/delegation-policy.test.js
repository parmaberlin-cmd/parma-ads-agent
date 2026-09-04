const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../state/DELEGATION_POLICY.json');

test('delegation v1.0 is explicitly authorized and cannot self-expand', () => {
  assert.equal(policy.policy_version, '1.0');
  assert.equal(policy.status, 'AUTHORIZED');
  assert.equal(policy.evolution.authorization_boundaries_may_self_expand, false);
});

test('Google Ads economic cage cannot increase total authorized daily budget', () => {
  const cage = policy.yellow.google_ads.economic_cage;
  assert.equal(cage.total_authorized_daily_budget_may_increase, false);
  assert.ok(cage.max_single_campaign_budget_increase_pct_via_reallocation <= 20);
  assert.equal(cage.new_campaign_may_spend_without_specific_authorized_cap, false);
});

test('tracking semantic changes remain RED', () => {
  const blocked = new Set(policy.yellow.tracking.forbidden_without_new_owner_approval);
  assert.ok(blocked.has('make_new_event_primary_conversion'));
  assert.ok(blocked.has('change_commercial_meaning_of_conversion'));
  assert.ok(blocked.has('replace_ground_truth'));
});

test('kill switch cannot expand privileges', () => {
  assert.equal(policy.kill_switch.may_expand_privileges_to_fix, false);
  assert.ok(policy.kill_switch.actions.includes('stop'));
  assert.ok(policy.kill_switch.actions.includes('rollback_when_safe'));
});

test('RED always includes spend, credentials and irreversible deletion gates', () => {
  const red = new Set(policy.red.always_requires_owner_approval);
  assert.ok(red.has('increase_total_spend'));
  assert.ok(red.has('credentials_api_keys_or_oauth_scope_expansion'));
  assert.ok(red.has('irreversible_deletion'));
});
