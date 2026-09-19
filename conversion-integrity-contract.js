'use strict';

const WIX_STATUSES = Object.freeze(['HELD','REQUESTED','DECLINED','RESERVED','SEATED','CANCELED','NO_SHOW','FINISHED','PAYMENT_INFORMATION_PENDING']);

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeWixAggregate(input = {}) {
  const total = finite(input.created_reservations);
  if (total === null) return { valid:false, reason:'created_reservations_required' };
  const raw = input.status_counts && typeof input.status_counts === 'object' ? input.status_counts : {};
  const status_counts = {};
  for (const [status, value] of Object.entries(raw)) {
    if (!WIX_STATUSES.includes(status)) return { valid:false, reason:'unknown_wix_status' };
    const n = finite(value);
    if (n === null) return { valid:false, reason:'invalid_wix_status_count' };
    status_counts[status] = n;
  }
  const sum = Object.values(status_counts).reduce((a,b)=>a+b,0);
  if (sum !== total) return { valid:false, reason:'status_counts_do_not_sum_to_created' };
  const online = finite(input.online_reservations);
  if (online !== null && online > total) return { valid:false, reason:'online_exceeds_created' };
  return {
    valid:true,
    source:'wix_table_reservations',
    date_basis:'reservation_created_date',
    timezone:input.timezone || null,
    created_reservations:total,
    confirmed_reservations:status_counts.RESERVED || 0,
    held_reservations:status_counts.HELD || 0,
    requested_reservations:status_counts.REQUESTED || 0,
    canceled_reservations:status_counts.CANCELED || 0,
    status_counts,
    online_reservations:online,
    attribution_scope:'wix_reservation_source_only',
    online_is_ads_attribution:false,
    pii_required:false,
  };
}

function buildConversionIntegrity(input = {}) {
  const wix = normalizeWixAggregate(input.wix || {});
  const ga4 = input.ga4 || {};
  const ads = input.google_ads || {};
  const blockers = [];
  if (!wix.valid) blockers.push(`wix:${wix.reason}`);
  if (input.window_start !== input.ga4_window_start || input.window_end !== input.ga4_window_end) blockers.push('ga4_window_not_aligned');
  if (input.window_start !== input.ads_window_start || input.window_end !== input.ads_window_end) blockers.push('ads_window_not_aligned');
  if (!input.timezone || input.timezone !== wix.timezone || input.timezone !== ga4.timezone || input.timezone !== ads.timezone) blockers.push('timezone_not_aligned');
  if (ga4.date_basis !== 'event_date') blockers.push('ga4_date_basis_not_event_date');
  if (ads.interaction_date_basis !== 'ad_interaction_date') blockers.push('ads_interaction_date_basis_unknown');
  if (ads.conversion_date_basis !== 'conversion_date') blockers.push('ads_conversion_date_basis_unknown');
  if (ga4.attribution_scope && ga4.attribution_scope !== 'session_source_medium') blockers.push('ga4_attribution_scope_unexpected');
  if (input.semantic_identity_verified !== true) blockers.push('semantic_identity_unverified');
  return {
    window:{start:input.window_start || null,end:input.window_end || null,timezone:input.timezone || null},
    wix,
    ga4:{...ga4,google_cpc_is_ads_credit:false},
    google_ads:ads,
    rules:{
      wix_online_is_google_ads:false,
      held_is_confirmed:false,
      numerical_similarity_proves_identity:false,
      primary_conversion_change_authorized:false,
      optimization_allowed:false,
    },
    blockers,
    status:blockers.length ? 'unverified' : 'candidate_verified',
    optimization_allowed:false,
    requires_commercial_semantics_decision: input.semantic_identity_verified === true,
  };
}

module.exports = { WIX_STATUSES, normalizeWixAggregate, buildConversionIntegrity };
