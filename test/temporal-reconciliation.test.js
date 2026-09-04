const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTemporalReconciliation } = require('../temporal-reconciliation');

test('session attribution cannot masquerade as Ads conversion attribution', () => {
  const out = buildTemporalReconciliation({
    ads_timezone:'Europe/Berlin', ga4_timezone:'Europe/Berlin', business_timezone:'Europe/Berlin',
    ads_date_basis:'conversion_date', ga4_date_basis:'event_date', ground_truth_date_basis:'created_date',
    ads_attribution_scope:'ads_attribution', ga4_attribution_scope:'session_source_medium', ground_truth_scope:'business_ground_truth',
    window_mature:true,
  });
  assert.equal(out.direct_count_comparison_supported, false);
  assert.equal(out.optimization_permission, false);
});

test('timezone mismatch blocks direct comparison', () => {
  const out = buildTemporalReconciliation({
    ads_timezone:'Europe/Berlin', ga4_timezone:'UTC', business_timezone:'Europe/Berlin',
    ads_date_basis:'conversion_date', ga4_date_basis:'event_date', ground_truth_date_basis:'created_date',
    ads_attribution_scope:'ads_attribution', ga4_attribution_scope:'event_attribution', ground_truth_scope:'business_ground_truth',
    window_mature:true,
  });
  assert.ok(out.blockers.includes('timezone_mismatch'));
  assert.equal(out.direct_count_comparison_supported, false);
});

test('fully aligned mature evidence can support comparison but never permission', () => {
  const out = buildTemporalReconciliation({
    ads_timezone:'Europe/Berlin', ga4_timezone:'Europe/Berlin', business_timezone:'Europe/Berlin',
    ads_date_basis:'conversion_date', ga4_date_basis:'event_date', ground_truth_date_basis:'created_date',
    ads_attribution_scope:'ads_attribution', ga4_attribution_scope:'event_attribution', ground_truth_scope:'business_ground_truth',
    window_mature:true,
  });
  assert.equal(out.direct_count_comparison_supported, true);
  assert.equal(out.writes_allowed, false);
  assert.equal(out.optimization_permission, false);
});

test('immature reporting window fails closed', () => {
  const out = buildTemporalReconciliation({
    ads_timezone:'Europe/Berlin', ga4_timezone:'Europe/Berlin', business_timezone:'Europe/Berlin',
    ads_date_basis:'conversion_date', ga4_date_basis:'event_date', ground_truth_date_basis:'created_date',
    ads_attribution_scope:'ads_attribution', ga4_attribution_scope:'event_attribution', ground_truth_scope:'business_ground_truth',
    window_mature:false,
  });
  assert.ok(out.blockers.includes('reporting_window_immature'));
  assert.equal(out.direct_count_comparison_supported, false);
});
