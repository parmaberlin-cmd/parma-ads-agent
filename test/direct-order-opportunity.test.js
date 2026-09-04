const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDirectOrderOpportunity } = require('../direct-order-opportunity');

test('unknown direct-order evidence lowers readiness instead of being guessed', () => {
  const out = buildDirectOrderOpportunity({ public_path_verified:true, mobile_continuity_verified:true });
  assert.equal(out.score, 30);
  assert.equal(out.outcome_verified, false);
  assert.equal(out.commercial_comparison_ready, false);
});

test('complete evidence reaches readiness score without granting a site or spend write', () => {
  const out = buildDirectOrderOpportunity({
    public_path_verified:true, mobile_continuity_verified:true, completion_semantics_verified:true,
    dedupe_verified:true, attribution_contract_verified:true, refund_semantics_verified:true,
    economics_complete:true, evidence_fresh:true,
  });
  assert.equal(out.score, 100);
  assert.equal(out.outcome_verified, true);
  assert.equal(out.commercial_comparison_ready, true);
  assert.equal(out.site_change_supported, false);
  assert.equal(out.writes_allowed, false);
  assert.equal(out.spend_authorized, false);
});
