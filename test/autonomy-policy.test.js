const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyAction, authorizeAutonomy, autonomyPolicySummary, ACTION_CLASSES } = require('../autonomy-policy');

test('read-only diagnostics are allowlisted autonomous actions', () => {
  const result = authorizeAutonomy({ name: 'run_diagnostics' }, {});
  assert.equal(result.allowed, true);
  assert.equal(result.action_class, ACTION_CLASSES.READ_ONLY);
});

test('budget changes always require human approval and are not autonomously allowed', () => {
  const result = authorizeAutonomy({ name: 'increase_budget' }, { autonomy_class: 'supervised_reversible_candidate', human_approved: true });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'human_approval_mandatory');
  assert.equal(result.human_approval_required, true);
});

test('campaign creation and activation remain blocked even after promotion', () => {
  for (const name of ['create_campaign', 'activate_campaign']) {
    const result = authorizeAutonomy({ name }, { autonomy_class: 'supervised_reversible_candidate', human_approved: true });
    assert.equal(result.allowed, false);
  }
});

test('unknown actions fail closed', () => {
  const result = authorizeAutonomy({ name: 'mystery_action' }, {});
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'unknown_action_not_allowlisted');
});

test('kill switch blocks otherwise safe actions', () => {
  const result = authorizeAutonomy({ name: 'collect_metrics' }, { kill_switch: true });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'kill_switch_active');
});

test('policy summary keeps spend and external writes disabled by default', () => {
  const summary = autonomyPolicySummary();
  assert.equal(summary.default_external_writes_allowed, false);
  assert.equal(summary.default_spend_allowed, false);
});