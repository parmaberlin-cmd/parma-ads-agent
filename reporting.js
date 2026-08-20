function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeActions(actions) {
  if (!Array.isArray(actions)) return [];

  return actions
    .filter((action) => action && typeof action.action_type === "string")
    .map((action) => ({
      type: action.action_type,
      value: toNumber(action.value),
    }));
}

function normalizeMetaInsight(insight = {}) {
  return {
    campaign_id: String(insight.campaign_id || ""),
    campaign_name: insight.campaign_name || null,
    spend_eur: round(toNumber(insight.spend)),
    impressions: toNumber(insight.impressions),
    reach: toNumber(insight.reach),
    clicks: toNumber(insight.clicks),
    ctr_percent: round(toNumber(insight.ctr), 4),
    cpc_eur: round(toNumber(insight.cpc), 4),
    cpm_eur: round(toNumber(insight.cpm), 4),
    frequency: round(toNumber(insight.frequency), 4),
    actions: normalizeActions(insight.actions),
    cost_per_action_type: normalizeActions(insight.cost_per_action_type),
  };
}

function hasEffectiveStatus(campaign, expectedStatus) {
  if (campaign.effective_status) {
    return campaign.effective_status === expectedStatus;
  }

  return campaign.status === expectedStatus;
}

function parseMetaDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function classifyCampaignDelivery(campaign, adsets, now = new Date()) {
  if (campaign.effective_status === "WITH_ISSUES") return "with_issues";
  if (
    campaign.status === "PAUSED" ||
    campaign.effective_status === "PAUSED" ||
    campaign.effective_status === "CAMPAIGN_PAUSED"
  ) {
    return "paused";
  }

  if (!hasEffectiveStatus(campaign, "ACTIVE")) return "not_delivering";

  // When child delivery data is unavailable, preserve Meta's campaign-level
  // status but make the lower-confidence source explicit in the report.
  if (!Array.isArray(adsets)) return "active_unverified";

  const campaignAdsets = adsets.filter(
    (adset) => String(adset.campaign_id || "") === String(campaign.id || "")
  );

  const activeNow = campaignAdsets.some((adset) => {
    if (!hasEffectiveStatus(adset, "ACTIVE")) return false;
    const startsAt = parseMetaDate(adset.start_time);
    const endsAt = parseMetaDate(adset.end_time);
    return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
  });
  if (activeNow) return "active";

  const scheduled = campaignAdsets.some((adset) => {
    const startsAt = parseMetaDate(adset.start_time);
    return hasEffectiveStatus(adset, "ACTIVE") && startsAt && startsAt > now;
  });
  if (scheduled) return "scheduled";

  const completed =
    campaignAdsets.length > 0 &&
    campaignAdsets.every((adset) => {
      const endsAt = parseMetaDate(adset.end_time);
      return endsAt && endsAt < now;
    });
  if (completed) return "completed";

  return "not_delivering";
}

function buildMetaOverview(
  campaigns = [],
  insights = [],
  adsets = null,
  now = new Date()
) {
  const normalizedInsights = insights.map(normalizeMetaInsight);
  const insightsByCampaignId = new Map(
    normalizedInsights.map((insight) => [insight.campaign_id, insight])
  );

  const campaignRows = campaigns.map((campaign) => {
    const campaignId = String(campaign.id || "");
    const insight = insightsByCampaignId.get(campaignId) || null;
    const deliveryStatus = classifyCampaignDelivery(campaign, adsets, now);

    return {
      id: campaignId,
      name: campaign.name || null,
      status: campaign.status || null,
      effective_status: campaign.effective_status || null,
      delivery_status: deliveryStatus,
      objective: campaign.objective || null,
      data_status: insight ? "has_data" : "no_data",
      metrics: insight,
    };
  });

  const totals = normalizedInsights.reduce(
    (summary, insight) => {
      summary.spend_eur += insight.spend_eur;
      summary.impressions += insight.impressions;
      summary.reach_sum += insight.reach;
      summary.clicks += insight.clicks;
      return summary;
    },
    { spend_eur: 0, impressions: 0, reach_sum: 0, clicks: 0 }
  );

  totals.spend_eur = round(totals.spend_eur);
  totals.ctr_percent = totals.impressions
    ? round((totals.clicks / totals.impressions) * 100, 4)
    : 0;
  totals.cpc_eur = totals.clicks
    ? round(totals.spend_eur / totals.clicks, 4)
    : 0;
  totals.cpm_eur = totals.impressions
    ? round((totals.spend_eur / totals.impressions) * 1000, 4)
    : 0;

  const countDeliveryStatus = (status) =>
    campaignRows.filter((campaign) => campaign.delivery_status === status).length;

  return {
    campaign_counts: {
      total: campaigns.length,
      active: countDeliveryStatus("active"),
      active_unverified: countDeliveryStatus("active_unverified"),
      completed: countDeliveryStatus("completed"),
      paused: countDeliveryStatus("paused"),
      scheduled: countDeliveryStatus("scheduled"),
      not_delivering: countDeliveryStatus("not_delivering"),
      with_issues: countDeliveryStatus("with_issues"),
      with_data: campaignRows.filter((campaign) => campaign.data_status === "has_data")
        .length,
      without_data: campaignRows.filter(
        (campaign) => campaign.data_status === "no_data"
      ).length,
      unmatched_insight_rows: normalizedInsights.filter(
        (insight) =>
          !campaigns.some(
            (campaign) => String(campaign.id || "") === insight.campaign_id
          )
      ).length,
    },
    totals,
    campaigns: campaignRows,
  };
}

function buildGoogleReadiness(environment = process.env) {
  const configurationComplete = Boolean(
    environment.GOOGLE_CLIENT_ID &&
      environment.GOOGLE_CLIENT_SECRET &&
      environment.GOOGLE_DEVELOPER_TOKEN &&
      environment.GOOGLE_REFRESH_TOKEN &&
      environment.GOOGLE_CUSTOMER_ID
  );

  return {
    configuration_complete: configurationComplete,
    api_access: "not_checked_by_report",
    reader_status: configurationComplete
      ? "configuration_ready_live_test_required"
      : "configuration_incomplete",
    next_step: configurationComplete
      ? "Run the protected Google test after Basic Access approval"
      : "Complete the protected Google configuration",
  };
}

module.exports = {
  buildGoogleReadiness,
  buildMetaOverview,
  classifyCampaignDelivery,
  normalizeMetaInsight,
};
