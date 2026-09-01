const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeOrderInventory, diagnoseOrderSignals } = require('../order-signal-diagnostics');
const { summarizeEventInventory } = require('../ga4-funnel-intelligence');
const { assertPublicPayloadSafe } = require('../public-output-safety');
const row = (name, count) => ({ dimensionValues: [{ value: name }], metricValues: [{ value: count }] });

test('collector inventory extracts order candidates without adding an API request', () => {
  const inventory = summarizeEventInventory([row('booking_completed', 927), row('table_reservation_completed', 11), row('purchase', 8), row('begin_checkout', 20)]);
  assert.deepEqual(inventory.order_candidates.map(x => x.event_name), ['begin_checkout', 'purchase']);
  const diagnosis = diagnoseOrderSignals({ access_ok: true, event_inventory: inventory }, { fresh: true });
  assert.equal(diagnosis.verified_orders, null); assert.equal(diagnosis.verified_revenue, null);
  assert.equal(diagnosis.optimization_allowed, false); assert.equal(diagnosis.reservation_events_excluded, true);
});
test('multiple completion signals are not added together or called duplicate orders', () => {
  const diagnosis = diagnoseOrderSignals({ access_ok: true, event_inventory: { order_candidates: summarizeOrderInventory([row('purchase', 10), row('order_completed', 10)]) } }, { fresh: true });
  assert.equal(diagnosis.parallel_completion_candidates, true);
  assert.equal(diagnosis.duplicate_orders_proven, false);
  assert.equal(diagnosis.verified_orders, null);
});
test('missing events in limited inventory do not prove zero sales or a broken ordering page', () => {
  const diagnosis = diagnoseOrderSignals({ access_ok: true, event_inventory: { order_candidates: [] } }, { fresh: true });
  assert.equal(diagnosis.status, 'no_candidates_in_returned_inventory');
  assert.equal(diagnosis.absence_proves_no_orders, false); assert.equal(diagnosis.coverage, 'limited_event_inventory');
});
test('failed or stale collection cannot reuse order candidates as current evidence', () => {
  for (const [access_ok, fresh] of [[false, true], [true, false]]) {
    const d = diagnoseOrderSignals({ access_ok, event_inventory: { order_candidates: summarizeOrderInventory([row('purchase', 8)]) } }, { fresh });
    assert.equal(d.status, 'source_unverified'); assert.deepEqual(d.candidates, []);
  }
});
for (const value of [null, undefined, '', false, true, -1, Infinity, 'private-marker']) {
  test(`invalid order signal count stays unknown: ${String(value)}`, () => {
    const d = summarizeOrderInventory([row('purchase', value)]);
    assert.equal(d[0].event_count, null);
  });
}
test('duplicate rows and arbitrary event names cannot inflate or leak into public output', () => {
  const inventory = summarizeOrderInventory([row('purchase', 10), row('purchase', 12), row('private-marker', 99)]);
  assert.equal(inventory.length, 1); assert.equal(inventory[0].event_count, null); assert.equal(inventory[0].ambiguous_rows, true);
  const d = diagnoseOrderSignals({ access_ok: true, event_inventory: { order_candidates: inventory } }, { fresh: true });
  assert.equal(JSON.stringify(d).includes('private-marker'), false);
  assert.doesNotThrow(() => assertPublicPayloadSafe(d));
});
