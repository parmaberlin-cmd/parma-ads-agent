const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGroundTruth, adapterState } = require('../wix-ground-truth-adapter');

test('adapter requires no PII and normalizes aggregate reservation counts', () => {
  const x = normalizeGroundTruth({ window_start:'2026-08-02', window_end:'2026-08-31', created_reservations:11, cancelled_reservations:2 });
  assert.equal(x.valid, true);
  assert.equal(x.ground_truth.pii_required, false);
  assert.equal(x.ground_truth.created_reservations, 11);
  assert.equal(x.ground_truth.non_cancelled_reservations, 9);
});

test('verified August Wix aggregate preserves status, online source and attribution boundary', () => {
  const x = normalizeGroundTruth({
    window_start:'2026-08-02', window_end:'2026-08-31',
    created_reservations:20, confirmed_reservations:9, pending_reservations:10,
    cancelled_reservations:1, online_reservations:20,
    source_detail_available:false, attribution_identifiers_available:false
  });
  assert.equal(x.valid, true);
  assert.equal(x.ground_truth.created_reservations, 20);
  assert.equal(x.ground_truth.non_cancelled_reservations, 19);
  assert.equal(x.ground_truth.online_reservations, 20);
  assert.equal(x.ground_truth.attribution_identifiers_available, false);
  assert.match(x.ground_truth.attribution_limit, /retroactive/);
});

test('status totals fail closed when they do not reconcile', () => {
  const x = normalizeGroundTruth({ window_start:'2026-08-02', window_end:'2026-08-31', created_reservations:20, confirmed_reservations:9, pending_reservations:9, cancelled_reservations:1 });
  assert.equal(x.valid, false);
  assert.equal(x.reason, 'status_counts_do_not_sum_to_created');
});

test('adapter permits aggregate evidence but still forbids wrong account', () => {
  const x = adapterState();
  assert.equal(x.external_call_performed, false);
  assert.equal(x.wrong_account_allowed, false);
  assert.equal(x.mode, 'aggregate_ground_truth_contract');
});
