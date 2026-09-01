const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMeasurementReadiness } = require('../measurement-readiness');

function completeInput() {
  return {
    source_health:true,
    temporal:{ ads_timezone:'Europe/Berlin', ga4_timezone:'Europe/Berlin', business_timezone:'Europe/Berlin', ads_date_basis:'conversion_date', ga4_date_basis:'event_date', ground_truth_date_basis:'created_date', ads_attribution_scope:'ads_attribution', ga4_attribution_scope:'event_attribution', ground_truth_scope:'business_ground_truth', window_mature:true },
    outcome:{ outcome:'reservation_completed', semantic_identity_verified:true, exact_date_window:true, timezone:'Europe/Berlin', date_basis:'created_date', counting_rule:'one_per_reservation', dedupe_rule:'reservation_id', maturity_verified:true, ground_truth_source:'reservation_system', cancellation_policy:'report_cancelled_separately' },
    funnel_type:'reservation',
    funnel:{ ad_click:100, landing_session:80, reservation_start:30, reservation_completed:10, completion_semantics_verified:true, dedupe_verified:true },
  };
}

test('one missing source gate blocks unified measurement readiness', () => {
  const input = completeInput(); input.source_health = false;
  const out = buildMeasurementReadiness(input);
  assert.equal(out.measurement_ready, false);
  assert.ok(out.blockers.includes('source_health_unverified'));
});

test('complete evidence permits analysis but no tracking campaign or spend write', () => {
  const out = buildMeasurementReadiness(completeInput());
  assert.equal(out.measurement_ready, true);
  assert.equal(out.optimization_analysis_allowed, true);
  assert.equal(out.execution_authorized, false);
  assert.equal(out.tracking_write_authorized, false);
  assert.equal(out.campaign_write_authorized, false);
  assert.equal(out.spend_authorized, false);
});
