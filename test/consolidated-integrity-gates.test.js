const test = require("node:test");
const assert = require("node:assert/strict");
const { assessConversionIntegrity } = require("../agent-foundation");
const { analyzeSearchTerms } = require("../acquisition-intelligence");
const { assessFunnel } = require("../optimization-manager");
const { buildFunnelInput } = require("../full-live-shadow-data");
const { buildShadowAgentReport } = require("../agent-shadow");

test("low conversion volume cannot authorize optimization even when sources agree", () => {
  const result = assessConversionIntegrity({
    googleAdsConversions: 1,
    ga4Bookings: 1,
    googleLastSeenAt: "2026-08-23T09:00:00Z",
    ga4LastSeenAt: "2026-08-23T09:00:00Z",
    now: new Date("2026-08-23T10:00:00Z"),
  });
  assert.equal(result.status, "unverified");
  assert.equal(result.comparable_volume, false);
  assert.equal(result.optimization_allowed, false);
  assert.ok(result.issues.includes("conversion_volume_too_low_for_optimization"));
});

test("missing freshness blocks optimization despite matching conversion totals", () => {
  const result = assessConversionIntegrity({ googleAdsConversions: 10, ga4Bookings: 10 });
  assert.equal(result.optimization_allowed, false);
  assert.ok(result.issues.includes("google_ads_freshness_unknown"));
  assert.ok(result.issues.includes("ga4_freshness_unknown"));
});

test("known keywords suppress duplicate expansion proposals", () => {
  const recommendations = analyzeSearchTerms([
    { search_term: "bio pizza berlin", keyword: "pizza berlin", clicks: 8, cost_eur: 6, conversions: 3 },
  ], { knownKeywords: [{ keyword: "Bio Pizza Berlin" }] });
  assert.equal(recommendations.some((item) => item.type === "keyword_expansion_candidate"), false);
});

test("integrated shadow flow uses keyword inventory to suppress duplicate expansion", () => {
  const report = buildShadowAgentReport({
    now: "2026-08-23T10:00:00Z",
    conversions: {
      google_ads_conversions: 4,
      booking_completed: 4,
      google_last_seen_at: "2026-08-23T09:00:00Z",
      ga4_last_seen_at: "2026-08-23T09:00:00Z",
    },
    search_terms: [{ search_term: "bio pizza berlin", keyword: "pizza berlin", clicks: 8, cost_eur: 6, conversions: 3 }],
    keywords: [{ keyword: "Bio Pizza Berlin", clicks: 8, cost_eur: 6, conversions: 3 }],
  });
  assert.equal(report.search_term_recommendations.some((item) => item.type === "keyword_expansion_candidate"), false);
});

test("missing booking-start tracking is reported instead of inventing leakage", () => {
  const result = assessFunnel({
    landingAvailable: true,
    adClicks: 20,
    landingViews: 18,
    reservationStarts: 0,
    bookings: 3,
    conversionIntegrity: "healthy",
    bookingStartedTracked: false,
  });
  assert.ok(result.issues.some((item) => item.code === "BOOKING_STARTED_TRACKING_MISSING"));
  assert.equal(result.issues.some((item) => item.code === "LANDING_TO_RESERVATION_LEAKAGE"), false);
  assert.equal(result.issues.some((item) => item.code === "RESERVATION_COMPLETION_LEAKAGE"), false);
});

test("GA4 event inventory propagates missing booking-start tracking automatically", () => {
  const funnel = buildFunnelInput(
    { live_sources: { google: { totals: { clicks: 20 } } } },
    {
      access_ok: true,
      google_cpc_booking_completed: 3,
      funnel: {
        event_names: ["reservation_page_view", "booking_completed"],
        totals: { reservation_page_view: 18, booking_completed: 3 },
        google_cpc: { reservation_page_view: 18, booking_completed: 3 },
      },
    }
  );
  assert.equal(funnel.bookingStartedTracked, false);
  const diagnosed = assessFunnel({ ...funnel, conversionIntegrity: "healthy" });
  assert.ok(diagnosed.issues.some((item) => item.code === "BOOKING_STARTED_TRACKING_MISSING"));
  assert.equal(diagnosed.issues.some((item) => item.code === "LANDING_TO_RESERVATION_LEAKAGE"), false);
});
