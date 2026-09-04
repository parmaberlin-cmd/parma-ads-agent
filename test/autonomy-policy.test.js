const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeAutonomy, autonomyPolicySummary, ACTION_CLASSES } = require('../autonomy-policy');

test('read-only diagnostics are allowlisted autonomous actions', () => {
  const result = authorizeAutonomy({ name: 'run_diagnostics' }, {});
  assert.equal(result.allowed, true);
  assert.equal(result.action_class, ACTION_CLASSES.READ_ONLY);
});

test('generic budget increases always require human approval', () => {
  const result = authorizeAutonomy({ name: 'increase_budget' }, { autonomy_class: 'supervised_reversible_candidate', human_approved: true });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'human_approval_mandatory');
});

test('campaign creation and activation remain blocked', () => {
  for (const name of ['create_campaign', 'activate_campaign']) assert.equal(authorizeAutonomy({ name }, {}).allowed, false);
});

test('authorized Google ad edits are allowed only inside the delegated cage', () => {
  const context = { account_verified:true, rollback_defined:true, audit_enabled:true, total_daily_budget_delta:0, single_campaign_budget_increase_pct:0 };
  const result = authorizeAutonomy({ name:'update_ad', platform:'google_ads', external_write:true }, context);
  assert.equal(result.allowed, true);
  assert.equal(result.action_class, ACTION_CLASSES.GOOGLE_CONTROLLED_WRITE);
  assert.equal(result.human_approval_required, false);
});

test('Google controlled writes fail closed without rollback and audit', () => {
  assert.equal(authorizeAutonomy({ name:'update_keyword', platform:'google_ads', external_write:true }, { account_verified:true, audit_enabled:true }).allowed, false);
  assert.equal(authorizeAutonomy({ name:'update_keyword', platform:'google_ads', external_write:true }, { account_verified:true, rollback_defined:true }).allowed, false);
});

test('Google reallocation cannot increase total spend or a campaign by more than 20 percent', () => {
  const base = { account_verified:true, rollback_defined:true, audit_enabled:true };
  assert.equal(authorizeAutonomy({ name:'reallocate_budget', platform:'google_ads' }, { ...base, total_daily_budget_delta:0, single_campaign_budget_increase_pct:20 }).allowed, true);
  assert.equal(authorizeAutonomy({ name:'reallocate_budget', platform:'google_ads' }, { ...base, total_daily_budget_delta:0.01 }).reason, 'total_spend_increase_requires_owner');
  assert.equal(authorizeAutonomy({ name:'reallocate_budget', platform:'google_ads' }, { ...base, total_daily_budget_delta:0, single_campaign_budget_increase_pct:20.01 }).reason, 'campaign_reallocation_above_20_percent');
});

test('conversion semantics, new campaign spend and credential changes remain owner gates', () => {
  const base = { account_verified:true, rollback_defined:true, audit_enabled:true, total_daily_budget_delta:0 };
  assert.equal(authorizeAutonomy({ name:'update_ad', platform:'google_ads' }, { ...base, changes_primary_conversion:true }).allowed, false);
  assert.equal(authorizeAutonomy({ name:'update_ad', platform:'google_ads' }, { ...base, new_campaign_spend:true }).allowed, false);
  assert.equal(authorizeAutonomy({ name:'update_ad', platform:'google_ads' }, { ...base, credential_or_scope_change:true }).allowed, false);
});

test('unknown actions fail closed', () => {
  const result = authorizeAutonomy({ name: 'mystery_action' }, {});
  assert.equal(result.allowed, false);
});

test('kill switch blocks otherwise safe and delegated actions', () => {
  assert.equal(authorizeAutonomy({ name: 'collect_metrics' }, { kill_switch: true }).allowed, false);
  assert.equal(authorizeAutonomy({ name:'update_ad', platform:'google_ads' }, { kill_switch:true, account_verified:true, rollback_defined:true, audit_enabled:true }).allowed, false);
});

test('policy summary keeps default external writes and spend disabled', () => {
  const summary = autonomyPolicySummary();
  assert.equal(summary.default_external_writes_allowed, false);
  assert.equal(summary.default_spend_allowed, false);
  assert.ok(summary.delegated_google_controlled.includes('update_ad'));
});
