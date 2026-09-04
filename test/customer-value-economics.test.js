const test = require('node:test');
const assert = require('node:assert/strict');
const { breakEvenCpa, simplifiedLtv, customerValueEconomics } = require('../customer-value-economics');

test('break-even CPA remains unknown without explicit contribution value', () => {
  assert.equal(breakEvenCpa({}).break_even_cpa, null);
});

test('break-even CPA uses only explicit contribution and optional safety factor', () => {
  const out = breakEvenCpa({ contribution_per_incremental_customer:12, safety_factor:0.75 });
  assert.equal(out.break_even_cpa, 9);
});

test('simplified LTV refuses to guess repeat behavior', () => {
  const out = simplifiedLtv({ contribution_per_order:10, incremental_retention_cost_per_customer:2 });
  assert.equal(out.ltv, null);
});

test('complete economics never authorizes spend', () => {
  const out = customerValueEconomics({ contribution_per_incremental_customer:12, contribution_per_order:10, expected_verified_orders_per_customer:2, incremental_retention_cost_per_customer:2 });
  assert.equal(out.complete, true);
  assert.equal(out.break_even_cpa, 12);
  assert.equal(out.simplified_ltv, 18);
  assert.equal(out.spend_authorized, false);
});
