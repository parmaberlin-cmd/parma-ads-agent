function cleanZone(value) {
  const zone = String(value || '').trim();
  return zone || null;
}

function cleanBasis(value) {
  const basis = String(value || '').trim().toLowerCase();
  const allowed = new Set(['interaction_date','conversion_date','event_date','created_date']);
  return allowed.has(basis) ? basis : null;
}

function cleanScope(value) {
  const scope = String(value || '').trim().toLowerCase();
  const allowed = new Set(['ads_attribution','session_source_medium','event_attribution','business_ground_truth']);
  return allowed.has(scope) ? scope : null;
}

function buildTemporalReconciliation(input = {}) {
  const adsZone = cleanZone(input.ads_timezone);
  const ga4Zone = cleanZone(input.ga4_timezone);
  const businessZone = cleanZone(input.business_timezone);
  const adsBasis = cleanBasis(input.ads_date_basis);
  const ga4Basis = cleanBasis(input.ga4_date_basis);
  const groundBasis = cleanBasis(input.ground_truth_date_basis);
  const adsScope = cleanScope(input.ads_attribution_scope);
  const ga4Scope = cleanScope(input.ga4_attribution_scope);
  const groundScope = cleanScope(input.ground_truth_scope);
  const windowMature = input.window_mature === true;

  const blockers = [];
  if (!adsZone || !ga4Zone || !businessZone) blockers.push('timezone_evidence_incomplete');
  else if (!(adsZone === ga4Zone && ga4Zone === businessZone)) blockers.push('timezone_mismatch');

  if (!adsBasis || !ga4Basis || !groundBasis) blockers.push('date_basis_evidence_incomplete');
  if (!adsScope || !ga4Scope || !groundScope) blockers.push('attribution_scope_evidence_incomplete');
  if (!windowMature) blockers.push('reporting_window_immature');

  const directCountComparison = Boolean(
    adsBasis && ga4Basis && groundBasis &&
    adsBasis === 'conversion_date' &&
    ga4Basis === 'event_date' &&
    groundBasis === 'created_date' &&
    adsScope === 'ads_attribution' &&
    ga4Scope === 'event_attribution' &&
    groundScope === 'business_ground_truth' &&
    blockers.length === 0
  );

  return {
    timezones: { ads: adsZone, ga4: ga4Zone, business: businessZone },
    date_basis: { ads: adsBasis, ga4: ga4Basis, ground_truth: groundBasis },
    attribution_scope: { ads: adsScope, ga4: ga4Scope, ground_truth: groundScope },
    window_mature: windowMature,
    boundary_effects_possible: true,
    direct_count_comparison_supported: directCountComparison,
    notes: [
      'interaction-date Ads conversions must not be treated as event-date equivalents',
      'session source/medium is not Google Ads conversion attribution',
      'matching totals do not prove semantic identity',
    ],
    blockers,
    writes_allowed: false,
    optimization_permission: false,
  };
}

module.exports = { buildTemporalReconciliation };
