const test = require('node:test');
const assert = require('node:assert/strict');
const verified = require('./fixtures/verified-conversion-evidence.json');
const { assessConversionConfidence, DIMENSIONS } = require('../conversion-confidence');
const { assessConversionIntegrity, detectAnomalies } = require('../agent-foundation');
const { conversionIntegrity, buildShadowDecisions } = require('../shadow-decision-engine');
const { summarizeChannel } = require('../daily-shadow-report');
const { assessFunnel } = require('../optimization-manager');
const { triageAnomaly } = require('../anomaly-triage');
const { pctChange } = require('../trend-intelligence');
const { buildShadowAgentReport } = require('../agent-shadow');

const now = new Date('2026-09-01T12:00:00Z');
const matching = { googleAdsConversions: 10, ga4Bookings: 10,
  googleCollectedAt: now.toISOString(), ga4CollectedAt: now.toISOString(), now };

for (const dimension of DIMENSIONS) {
  for (const missing of [undefined, false, 'partial', 'true']) {
    test(`all evidence gates are mandatory: ${dimension}=${missing}`, () => {
      const evidence = { ...verified, [dimension]: missing };
      assert.equal(assessConversionConfidence(evidence).optimization_allowed, false);
      assert.equal(assessConversionIntegrity({ ...matching, reconciliationEvidence: evidence }).optimization_allowed, false);
    });
  }
}
test('matching counters do not verify business outcomes in either engine', () => {
  const runtime = assessConversionIntegrity(matching);
  assert.equal(runtime.status, 'unverified');
  assert.equal(runtime.discrepancy_ratio, 0);
  assert.equal(runtime.discrepancy_is_descriptive_only, true);
  assert.equal(conversionIntegrity({ googleConversions: 10, ga4GoogleCpcBookings: 10 }).safe_for_optimization, false);
});
test('different unaligned counters do not prove a tracking defect', () => {
  const r = assessConversionIntegrity({ ...matching, ga4Bookings: 106 });
  assert.equal(r.issues.includes('conversion_sources_disagree'), false);
  assert.equal(r.optimization_allowed, false);
});
for (const bad of [null, undefined, '', ' ', false, true, NaN, Infinity, -1, [], {}]) {
  test(`malformed metric is unknown: ${String(bad)}`, () => {
    assert.equal(summarizeChannel({ clicks: bad }).clicks, null);
    assert.equal(pctChange(bad, 10), null);
    assert.equal(assessConversionIntegrity({ ...matching, googleAdsConversions: bad, reconciliationEvidence: verified }).optimization_allowed, false);
    assert.equal(buildShadowDecisions({ google: { cost: 10, bookings: bad, baselineBookings: 5 } }).decisions.some(x => x.reason === 'spend_without_bookings' || x.action === 'diagnose_booking_drop'), false);
  });
}
test('unverified booking signals stay descriptive, missing cost cannot become free bookings', () => {
  const unverified = summarizeChannel({ cost: 20, clicks: 10, conversions: 927 });
  assert.equal(unverified.bookings, null);
  assert.equal(unverified.observed_conversion_signals, 927);
  assert.equal(unverified.cost_per_booking_eur, null);
  assert.equal(summarizeChannel({ bookings: 3, booking_semantics_verified: true }).cost_per_booking_eur, null);
});
test('future collector timestamps fail closed', () => {
  assert.equal(assessConversionIntegrity({ ...matching, reconciliationEvidence: verified, ga4CollectedAt: '2026-09-02T12:00:00Z' }).optimization_allowed, false);
});
test('missing events or incomparable populations cannot diagnose funnel leakage', () => {
  for (const patch of [{}, { measurementVerified: true }, { populationComparable: true }]) {
    const r = assessFunnel({ adClicks: 100, landingViews: 0, reservationStarts: 0, bookings: 927, ...patch });
    assert.equal(r.issues.some(x => /LEAKAGE|LANDING_UNAVAILABLE/.test(x.code)), false);
    assert.equal(r.comparison_verified, false);
  }
  assert.equal(assessFunnel({}).metrics.landing_views, null);
});
test('missing click or conversion readings do not imply collapse', () => {
  assert.deepEqual(detectAnomalies({ current: { spend: 20 }, baseline: { conversions: 5 } }), []);
  assert.equal(triageAnomaly({}).optimization_allowed, false);
});
test('runtime with high counts but unverified meaning withholds conversion-based proposals', () => {
  const r = buildShadowAgentReport({ now: now.toISOString(),
    conversions: { google_ads_conversions: 10, booking_completed: 10, google_collected_at: now.toISOString(), ga4_collected_at: now.toISOString() },
    search_terms: [{ search_term: 'pizza near me', cost_eur: 30, clicks: 20, conversions: 0 }],
    budget_inputs: [{ spend_eur: 10, conversions: 10, target_cpa_eur: 10 }],
  });
  assert.equal(r.budget_recommendations[0].proposed_delta_percent, 0);
  assert.deepEqual(r.search_term_recommendations, []);
  assert.deepEqual(r.opportunities, []);
  assert.deepEqual(r.budget_simulation, []);
  assert.equal(r.executive.estimated_waste_eur, null);
  assert.equal(r.business_value.estimated_revenue_eur, null);
  assert.equal(r.writes_allowed, false);
});
