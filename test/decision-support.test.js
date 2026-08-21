const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDecisionSupportReport } = require("../decision-support");

test("prioritizes delivery issues above all other recommendations", () => {
  const report = buildDecisionSupportReport({
    meta: {
      campaign_counts: { total: 2, with_issues: 1, active: 0, active_unverified: 0 },
      totals: { spend_eur: 10, clicks: 0, impressions: 1000 },
    },
    google: { configuration_complete: false },
    conversions: { booking_completed: 0 },
  });

  assert.equal(report.decision_status, "blocked");
  assert.equal(report.recommendations[0].code, "META_DELIVERY_ISSUES");
  assert.equal(report.recommendations[0].score, 100);
  assert.equal(report.recommendation_counts.critical, 1);
});

test("flags configured Meta campaigns with no active delivery and requires authorization", () => {
  const report = buildDecisionSupportReport({
    meta: {
      campaign_counts: { total: 3, active: 0, active_unverified: 0, with_issues: 0 },
      totals: { spend_eur: 0, clicks: 0, impressions: 0 },
    },
    google: { configuration_complete: true, api_access: "verified" },
    conversions: { booking_completed: 0 },
  });

  const recommendation = report.recommendations.find(
    (item) => item.code === "META_NO_ACTIVE_DELIVERY"
  );

  assert.ok(recommendation);
  assert.equal(recommendation.priority, "high");
  assert.equal(recommendation.requires_authorization, true);
  assert.equal(report.decision_status, "attention_required");
});

test("flags clicks without bookings as a conversion priority", () => {
  const report = buildDecisionSupportReport({
    meta: {
      campaign_counts: { total: 1, active: 1, active_unverified: 0, with_issues: 0 },
      totals: { spend_eur: 18, clicks: 24, impressions: 2000 },
    },
    google: { configuration_complete: true, api_access: "verified" },
    conversions: { booking_completed: 0 },
  });

  const recommendation = report.recommendations.find(
    (item) => item.code === "CLICKS_WITHOUT_BOOKINGS"
  );

  assert.ok(recommendation);
  assert.equal(recommendation.priority, "high");
  assert.equal(recommendation.score, 92);
  assert.match(recommendation.action, /tracking/i);
});

test("does not recommend low CTR when aggregate CTR is at least one percent", () => {
  const report = buildDecisionSupportReport({
    meta: {
      campaign_counts: { total: 1, active: 1, active_unverified: 0, with_issues: 0 },
      totals: { spend_eur: 10, clicks: 20, impressions: 1000 },
    },
    google: { configuration_complete: true, api_access: "verified" },
    conversions: { booking_completed: 2 },
  });

  assert.equal(
    report.recommendations.some((item) => item.code === "LOW_META_CTR"),
    false
  );
  assert.equal(report.decision_status, "monitor");
});

test("keeps Google live validation distinct from configuration completeness", () => {
  const report = buildDecisionSupportReport({
    meta: { campaign_counts: {}, totals: {} },
    google: {
      configuration_complete: true,
      api_access: "not_checked_by_report",
    },
    conversions: {},
  });

  assert.deepEqual(report.recommendations, [
    {
      code: "GOOGLE_LIVE_ACCESS_UNVERIFIED",
      priority: "medium",
      score: 60,
      channel: "google",
      reason:
        "Google credentials appear configured, but live API access has not been validated by this report.",
      action:
        "Run the protected read-only Google access test before trusting campaign-level recommendations.",
      requires_authorization: false,
    },
  ]);
});
