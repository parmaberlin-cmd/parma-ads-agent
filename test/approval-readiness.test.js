const test = require('node:test');
const assert = require('node:assert/strict');
const { approvalReadiness } = require('../approval-readiness');

test('incomplete gates are not surfaced to the human', () => {
  const out = approvalReadiness({ ci_green:true });
  assert.equal(out.surface_to_human.length, 0);
  assert.equal(out.ask_nothing_if_none_ready, true);
});

test('reader publication can be ready without making spend or tracking ready', () => {
  const out = approvalReadiness({ ci_green:true, reader_read_only_verified:true, sanitization_verified:true });
  assert.deepEqual(out.surface_to_human, ['reader_publish']);
  assert.equal(out.gates.spend_change.ready_for_human_decision, false);
  assert.equal(out.gates.tracking_change.ready_for_human_decision, false);
  assert.equal(out.execution_authorized, false);
});

test('even fully prepared spend gate is only ready for decision, never approved', () => {
  const out = approvalReadiness({ measurement_verified:true, customer_value_verified:true, marginal_response_verified:true, rollback_defined:true });
  assert.equal(out.gates.spend_change.ready_for_human_decision, true);
  assert.equal(out.gates.spend_change.approval_granted, false);
  assert.equal(out.spend_authorized, false);
});
