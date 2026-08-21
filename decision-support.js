function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function makeRecommendation({
  code,
  priority,
  score,
  channel,
  reason,
  action,
  requires_authorization = false,
}) {
  return {
    code,
    priority,
    score: clampScore(score),
    channel,
    reason,
    action,
    requires_authorization,
  };
}

function buildDecisionSupportReport({
  meta = {},
  google = {},
  conversions = {},
} = {}) {
  const recommendations = [];

  const metaCounts = meta.campaign_counts || {};
  const metaTotals = meta.totals || {};
  const spend = toFiniteNumber(metaTotals.spend_eur);
  const clicks = toFiniteNumber(metaTotals.clicks);
  const impressions = toFiniteNumber(metaTotals.impressions);
  const bookingConversions = toFiniteNumber(conversions.booking_completed);

  if (toFiniteNumber(metaCounts.with_issues) > 0) {
    recommendations.push(
      makeRecommendation({
        code: "META_DELIVERY_ISSUES",
        priority: "critical",
        score: 100,
        channel: "meta",
        reason: `${metaCounts.with_issues} Meta campaign(s) have delivery issues.`,
        action: "Diagnose the affected campaigns before increasing spend or launching new variants.",
      })
    );
  }

  const activeMeta =
    toFiniteNumber(metaCounts.active) + toFiniteNumber(metaCounts.active_unverified);
  if (activeMeta === 0 && toFiniteNumber(metaCounts.total) > 0) {
    recommendations.push(
      makeRecommendation({
        code: "META_NO_ACTIVE_DELIVERY",
        priority: "high",
        score: 90,
        channel: "meta",
        reason: "Meta has campaigns configured but none are confirmed as actively delivering.",
        action: "Prepare a paused campaign draft for review so advertising can resume safely.",
        requires_authorization: true,
      })
    );
  }

  if (spend > 0 && clicks === 0) {
    recommendations.push(
      makeRecommendation({
        code: "META_SPEND_WITHOUT_CLICKS",
        priority: "high",
        score: 88,
        channel: "meta",
        reason: `Meta recorded €${spend.toFixed(2)} spend with no clicks.`,
        action: "Review creative, audience, placements, and delivery diagnostics before additional spend.",
      })
    );
  }

  if (clicks > 0 && bookingConversions === 0) {
    const score = clicks >= 20 ? 92 : clicks >= 10 ? 82 : 72;
    recommendations.push(
      makeRecommendation({
        code: "CLICKS_WITHOUT_BOOKINGS",
        priority: clicks >= 20 ? "high" : "medium",
        score,
        channel: "conversion",
        reason: `${clicks} paid click(s) are visible but no booking_completed conversion is present in the supplied conversion window.`,
        action: "Validate booking tracking and landing-page conversion friction before optimizing for more traffic.",
      })
    );
  }

  if (impressions >= 1000 && clicks > 0) {
    const ctr = (clicks / impressions) * 100;
    if (ctr < 1) {
      recommendations.push(
        makeRecommendation({
          code: "LOW_META_CTR",
          priority: "medium",
          score: 65,
          channel: "meta",
          reason: `Aggregate Meta CTR is ${ctr.toFixed(2)}%, below the report's 1% attention threshold.`,
          action: "Test stronger local creative and clearer reservation intent before expanding reach.",
          requires_authorization: true,
        })
      );
    }
  }

  if (google.configuration_complete === false) {
    recommendations.push(
      makeRecommendation({
        code: "GOOGLE_CONFIGURATION_INCOMPLETE",
        priority: "high",
        score: 85,
        channel: "google",
        reason: "Google Ads read configuration is incomplete.",
        action: "Complete the protected Google configuration before using Google performance data for decisions.",
      })
    );
  } else if (google.api_access === "not_checked_by_report") {
    recommendations.push(
      makeRecommendation({
        code: "GOOGLE_LIVE_ACCESS_UNVERIFIED",
        priority: "medium",
        score: 60,
        channel: "google",
        reason: "Google credentials appear configured, but live API access has not been validated by this report.",
        action: "Run the protected read-only Google access test before trusting campaign-level recommendations.",
      })
    );
  }

  recommendations.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

  const critical = recommendations.filter((item) => item.priority === "critical").length;
  const high = recommendations.filter((item) => item.priority === "high").length;

  return {
    decision_status: critical > 0 ? "blocked" : high > 0 ? "attention_required" : "monitor",
    recommendation_counts: {
      total: recommendations.length,
      critical,
      high,
      medium: recommendations.filter((item) => item.priority === "medium").length,
      authorization_required: recommendations.filter(
        (item) => item.requires_authorization
      ).length,
    },
    recommendations,
  };
}

module.exports = {
  buildDecisionSupportReport,
};
