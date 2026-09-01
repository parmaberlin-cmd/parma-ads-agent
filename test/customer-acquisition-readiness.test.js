const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCustomerAcquisitionReadiness } = require('../customer-acquisition-readiness');

test('traffic evidence alone cannot rank channels by customer value', () => {
  const out = buildCustomerAcquisitionReadiness({ direct_order:{ public_path_verified:true, mobile_continuity_verified:true } });
  assert.equal(out.ready_for_commercial_ranking, false);
  assert.equal(out.safe_default_priority, 'repair_measurement_and_collect_missing_value_inputs');
});

test('one verified valued outcome can make commercial ranking analyzable without granting writes', () => {
  const out = buildCustomerAcquisitionReadiness({
    measurement_verified:true, economics_complete:true,
    reservation:{ ad_click:100, landing_session:80, reservation_start:30, reservation_completed:10, completion_semantics_verified:true, dedupe_verified:true },
  });
  assert.equal(out.ready_for_commercial_ranking, true);
  assert.equal(out.campaign_mutation_allowed, false);
  assert.equal(out.site_mutation_allowed, false);
  assert.equal(out.spend_authorized, false);
});
