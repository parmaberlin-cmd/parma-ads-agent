const test = require("node:test");
const assert = require("node:assert/strict");
const { buildShadowAgentReport } = require("../agent-shadow");

test("shadow agent connects modules without allowing writes", () => {
  const report = buildShadowAgentReport({
    now: "2026-08-21T18:00:00Z",
    conversions: {
      google_ads_conversions: 0,
      booking_completed: 5,
      google_last_seen_at: "2026-08-21T17:00:00Z",
      ga4_last_seen_at: "2026-08-21T17:00:00Z",
    },
    current: { spend: 20, clicks: 8, conversions: 0, delivery_active: true },
    baseline: { spend: 20, conversions: 5, cpc: 0.4 },
    access: { google_ok: true, meta_ok: true },
    search_terms: [{ search_term: "competitor pizza", clicks: 8, cost_eur: 9, conversions: 0, match_type: "broad" }],
    creatives: [{ creative_id: "reel-a", impressions: 1000, clicks: 20, bookings: 0, spend_eur: 10, frequency: 4 }],
    funnel: { landingAvailable: true, adClicks: 20, landingViews: 18, reservationStarts: 4, bookings: 1 },
    budget_inputs: [{ channel: "google", campaign: "Dinner", spend_eur: 20, conversions: 5, target_cpa_eur: 10 }],
    channel_signals: { google: { clicks: 20, intent_conversions: 0 }, meta: { reach: 1000, bookings: 0 } },
    business_value: { spendEur: 20, bookings: 1, avgPartySize: 2, avgSpendPerGuestEur: 24 },
  });

  assert.equal(report.mode, "shadow");
  assert.equal(report.writes_allowed, false);
  assert.equal(report.conversion_integrity.optimization_allowed, false);
  assert.equal(report.budget_recommendations[0].recommendation, "keep");
  assert.ok(report.search_term_recommendations.some((x) => x.type === "negative_keyword_candidate"));
  assert.ok(report.creative_test_proposals.length > 0);
  assert.ok(report.daily_manager.primary_priorities.length > 0);
  assert.equal(report.journal.proposed_action, "review_shadow_report");
});

test("healthy conversion integrity allows bounded budget recommendation but never a write", () => {
  const report = buildShadowAgentReport({
    conversions: { google_ads_conversions: 4, booking_completed: 4 },
    budget_inputs: [{ channel: "google", campaign: "Dinner", spend_eur: 20, conversions: 4, target_cpa_eur: 10 }],
  });
  assert.equal(report.conversion_integrity.optimization_allowed, true);
  assert.equal(report.budget_recommendations[0].recommendation, "increase");
  assert.equal(report.budget_recommendations[0].requires_authorization, true);
  assert.equal(report.writes_allowed, false);
});
