'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWixAggregate, buildConversionIntegrity } = require('../conversion-integrity-contract');

test('normalizes verified Aug Wix aggregate without relabeling HELD', () => {
  const r = normalizeWixAggregate({created_reservations:20,status_counts:{RESERVED:9,HELD:10,CANCELED:1},online_reservations:20,timezone:'Europe/Berlin'});
  assert.equal(r.valid,true);
  assert.equal(r.confirmed_reservations,9);
  assert.equal(r.held_reservations,10);
  assert.equal(r.canceled_reservations,1);
  assert.equal(r.online_is_ads_attribution,false);
});

test('fails when Wix lifecycle counts do not sum to creation ground truth', () => {
  assert.equal(normalizeWixAggregate({created_reservations:20,status_counts:{RESERVED:9,HELD:9,CANCELED:1}}).valid,false);
});

test('never promotes ONLINE to Google Ads attribution and keeps semantic identity blocked', () => {
  const r = buildConversionIntegrity({
    window_start:'2026-08-02',window_end:'2026-08-31',timezone:'Europe/Berlin',
    ga4_window_start:'2026-08-02',ga4_window_end:'2026-08-31',ads_window_start:'2026-08-02',ads_window_end:'2026-08-31',
    wix:{created_reservations:20,status_counts:{RESERVED:9,HELD:10,CANCELED:1},online_reservations:20,timezone:'Europe/Berlin'},
    ga4:{timezone:'Europe/Berlin',date_basis:'event_date',attribution_scope:'session_source_medium',booking_completed:927,table_reservation_completed:11},
    google_ads:{timezone:'Europe/Berlin',interaction_date_basis:'ad_interaction_date',conversion_date_basis:'conversion_date',conversion_action:'booking_completed'},
    semantic_identity_verified:false,
  });
  assert.equal(r.rules.wix_online_is_google_ads,false);
  assert.equal(r.ga4.google_cpc_is_ads_credit,false);
  assert.equal(r.rules.numerical_similarity_proves_identity,false);
  assert.equal(r.optimization_allowed,false);
  assert.ok(r.blockers.includes('semantic_identity_unverified'));
});

test('detects date and timezone mismatches rather than silently reconciling them', () => {
  const r = buildConversionIntegrity({
    window_start:'2026-08-02',window_end:'2026-08-31',timezone:'Europe/Berlin',
    ga4_window_start:'2026-08-01',ga4_window_end:'2026-08-31',ads_window_start:'2026-08-02',ads_window_end:'2026-08-31',
    wix:{created_reservations:1,status_counts:{RESERVED:1},timezone:'Europe/Berlin'},
    ga4:{timezone:'UTC',date_basis:'event_date',attribution_scope:'session_source_medium'},
    google_ads:{timezone:'Europe/Berlin',interaction_date_basis:'ad_interaction_date',conversion_date_basis:'conversion_date'},
  });
  assert.ok(r.blockers.includes('ga4_window_not_aligned'));
  assert.ok(r.blockers.includes('timezone_not_aligned'));
});
