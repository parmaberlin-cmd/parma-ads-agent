const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGroundTruth, adapterState } = require('../wix-ground-truth-adapter');

test('adapter requires no PII and normalizes aggregate reservation counts', () => {
  const x = normalizeGroundTruth({ window_start:'2026-08-02', window_end:'2026-08-31', created_reservations:11, cancelled_reservations:2 });
  assert.equal(x.valid, true);
  assert.equal(x.ground_truth.pii_required, false);
  assert.equal(x.ground_truth.created_reservations, 11);
});

test('adapter remains dormant and forbids wrong account', () => {
  const x = adapterState();
  assert.equal(x.external_call_performed, false);
  assert.equal(x.wrong_account_allowed, false);
});
