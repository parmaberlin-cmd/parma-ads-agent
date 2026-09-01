const test = require("node:test");
const assert = require("node:assert/strict");
const { collectGoogleSearchTerms, collectGoogleKeywords } = require("../google-search-intelligence");
const { summarizeFunnel, reconcileConversions } = require("../ga4-funnel-intelligence");
const { buildFunnelInput } = require("../full-live-shadow-data");
const { detectWaste, buildSafetyGate } = require("../preaccess-intelligence");
const { buildShadowAgentReport } = require("../agent-shadow");
const { runAdversarialChecks } = require("../agent-learning");

test("Google search collectors use query-only transport and validate dates", async () => {
  const queries = [];
  const customer = { query: async (query) => { queries.push(query); return []; } };
  await collectGoogleSearchTerms({ customer, start: "2026-08-01", end: "2026-08-20" });
  await collectGoogleKeywords({ customer, start: "2026-08-01", end: "2026-08-20" });
  assert.equal(queries.length, 2);
  assert.match(queries[0], /FROM search_term_view/);
  assert.match(queries[1], /FROM keyword_view/);
  await assert.rejects(() => collectGoogleSearchTerms({ customer, start: "bad", end: "2026-08-20" }), /YYYY-MM-DD/);
});

test("GA4 funnel summary separates google cpc and reconciliation fails closed", () => {
  const rows = [
    { dimensionValues: [{ value: "reservation_start" }, { value: "google" }, { value: "cpc" }], metricValues: [{ value: "4" }] },
    { dimensionValues: [{ value: "booking_completed" }, { value: "google" }, { value: "cpc" }], metricValues: [{ value: "2" }] },
    { dimensionValues: [{ value: "booking_completed" }, { value: "direct" }, { value: "(none)" }], metricValues: [{ value: "3" }] },
  ];
  const result = summarizeFunnel(rows, ["reservation_start", "booking_completed"]);
  assert.equal(result.totals.booking_completed, 5);
  assert.equal(result.google_cpc.booking_completed, 2);
  assert.equal(reconcileConversions({ googleAdsConversions: 8, ga4GoogleCpcBookings: 2 }).automation_safe, false);
});

test("full funnel input uses Google CPC events without inventing steps", () => {
  const input = buildFunnelInput(
    { live_sources: { google: { totals: { clicks: 10 } } } },
    { access_ok: true, google_cpc_booking_completed: 2, funnel: { event_names: ["reservation_page_view", "reservation_start", "booking_completed"], totals: { reservation_page_view: 10, reservation_start: 5, booking_completed: 3 }, google_cpc: { reservation_page_view: 8, reservation_start: 4, booking_completed: 2 } } }
  );
  assert.deepEqual(
    { adClicks: input.adClicks, landingViews: input.landingViews, reservationStarts: input.reservationStarts, bookings: input.bookings },
    { adClicks: 10, landingViews: 8, reservationStarts: 4, bookings: 2 }
  );
});

test("pre-access intelligence remains proposal-only and zero-write", () => {
  const waste = detectWaste({ searchTerms: [{ search_term: "jobs pizza", clicks: 8, cost_eur: 7, conversions: 0 }] });
  assert.equal(waste.items.length, 1);
  assert.equal(waste.items[0].requires_authorization, true);
  const gate = buildSafetyGate({ conversionIntegrity: { optimization_allowed: true }, ga4Ok: true, googleOk: true, funnelStatus: "healthy", evidenceCount: 10 });
  assert.equal(gate.automation_allowed, false);
  assert.equal(gate.recommendation_mode, "proposal_only");
});

test("integrated shadow report exposes intelligence but never enables writes", () => {
  const report = buildShadowAgentReport({
    conversion_evidence: require('./fixtures/verified-conversion-evidence.json'),
    now: "2026-08-23T10:00:00.000Z",
    access: { google_ok: true, ga4_ok: true, meta_ok: true },
    conversions: { google_ads_conversions: 4, booking_completed: 4, google_last_seen_at: "2026-08-23T09:00:00.000Z", ga4_last_seen_at: "2026-08-23T09:00:00.000Z" },
    search_terms: [{ search_term: "jobs pizza", matched_keyword: "pizza", matched_keyword_match_type: "BROAD", clicks: 10, cost_eur: 8, conversions: 0 }],
    keywords: [{ keyword: "pizza berlin", clicks: 10, cost_eur: 9, conversions: 0 }],
    funnel: { landingAvailable: true, adClicks: 20, landingViews: 18, reservationStarts: 8, bookings: 4 },
  });
  assert.equal(report.mode, "shadow");
  assert.equal(report.writes_allowed, false);
  assert.equal(report.safety_gate.automation_allowed, false);
  assert.ok(report.waste.estimated_waste_eur > 0);
});

test("adversarial pre-access scenarios all fail closed", () => {
  const results = runAdversarialChecks(buildShadowAgentReport);
  assert.equal(results.length, 4);
  assert.equal(results.every((result) => result.passed), true);
});
