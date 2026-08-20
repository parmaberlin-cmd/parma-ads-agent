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

function buildMetaOverview(campaigns = [], insights = []) {
  const normalizedInsights = insights.map(normalizeMetaInsight);
  const insightsByCampaignId = new Map(
    normalizedInsights.map((insight) => [insight.campaign_id, insight])
  );

  const campaignRows = campaigns.map((campaign) => {
    const campaignId = String(campaign.id || "");
    const insight = insightsByCampaignId.get(campaignId) || null;

    return {
      id: campaignId,
      name: campaign.name || null,
      status: campaign.status || null,
      effective_status: campaign.effective_status || null,
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

  const active = campaigns.filter((campaign) =>
    hasEffectiveStatus(campaign, "ACTIVE")
  ).length;
  const paused = campaigns.filter((campaign) =>
    hasEffectiveStatus(campaign, "PAUSED")
  ).length;
  const withIssues = campaigns.filter(
    (campaign) => campaign.effective_status === "WITH_ISSUES"
  ).length;

  return {
    campaign_counts: {
      total: campaigns.length,
      active,
      paused,
      with_issues: withIssues,
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
  normalizeMetaInsight,
};
