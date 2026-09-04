const test = require('node:test');
const assert = require('node:assert/strict');
const { assessCustomerFunnel } = require('../customer-funnel-integrity');

test('missing reservation start stays unknown rather than becoming leakage', () => {
  const out = assessCustomerFunnel('reservation', { ad_click:100, landing_session:80, reservation_completed:10 });
  assert.ok(out.missing_steps.includes('reservation_start'));
  assert.equal(out.leakage_claim_supported, false);
  assert.equal(out.optimization_allowed, false);
});

test('direct order funnel rejects impossible downstream counts', () => {
  const out = assessCustomerFunnel('direct_order', { ad_click:100, landing_session:80, order_cta:60, checkout_start:70, direct_order_completed:20, completion_semantics_verified:true, dedupe_verified:true });
  assert.ok(out.impossible_relationships.includes('checkout_start_exceeds_order_cta'));
  assert.equal(out.optimization_allowed, false);
});

test('complete verified funnel can support analysis but never execution', () => {
  const out = assessCustomerFunnel('reservation', { ad_click:100, landing_session:80, reservation_start:30, reservation_completed:10, completion_semantics_verified:true, dedupe_verified:true });
  assert.equal(out.status, 'verified_funnel');
  assert.equal(out.optimization_allowed, true);
  assert.equal(out.execution_authorized, false);
  assert.equal(out.writes_allowed, false);
});
