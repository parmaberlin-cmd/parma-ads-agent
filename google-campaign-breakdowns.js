function microsToEur(value) {
  return Number(value || 0) / 1_000_000;
}

function numberOrNull(value) {
  return value == null ? null : Number(value);
}

function validateInput({ customer, campaignId, start, end }) {
  if (!customer || typeof customer.query !== "function") throw new TypeError("customer.query is required");
  if (!/^\d{1,20}$/.test(String(campaignId || ""))) throw new TypeError("campaignId is invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(end || ""))) {
    throw new TypeError("start and end must be YYYY-MM-DD");
  }
}

function metricFields(row) {
  return {
    impressions: Number(row.metrics?.impressions || 0),
    clicks: Number(row.metrics?.clicks || 0),
    cost_eur: microsToEur(row.metrics?.cost_micros),
    conversions: Number(row.metrics?.conversions || 0),
    conversion_value: Number(row.metrics?.conversions_value || 0),
  };
}

async function collectCampaignSearchTerms({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, ad_group.id, search_term_view.search_term,
      segments.keyword.info.text, segments.keyword.info.match_type,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({
    ad_group_id: String(row.ad_group?.id || ""),
    ad_group: row.ad_group?.name || null,
    search_term: row.search_term_view?.search_term || null,
    matched_keyword: row.segments?.keyword?.info?.text || null,
    match_type: row.segments?.keyword?.info?.match_type || null,
    ...metricFields(row),
  }));
}

async function collectCampaignKeywords({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, ad_group.id, ad_group.name,
      ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
      ad_group_criterion.status, metrics.impressions, metrics.clicks,
      metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM keyword_view
    WHERE campaign.id = ${campaignId}
      AND ad_group_criterion.status != 'REMOVED'
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({
    ad_group_id: String(row.ad_group?.id || ""),
    ad_group: row.ad_group?.name || null,
    keyword: row.ad_group_criterion?.keyword?.text || null,
    match_type: row.ad_group_criterion?.keyword?.match_type || null,
    status: row.ad_group_criterion?.status || null,
    ...metricFields(row),
  }));
}

async function collectCampaignDevices({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, segments.device, metrics.impressions, metrics.clicks,
      metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({ device: row.segments?.device || "UNKNOWN", ...metricFields(row) }));
}

async function collectCampaignHours({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, segments.day_of_week, segments.hour, metrics.impressions, metrics.clicks,
      metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({
    day_of_week: row.segments?.day_of_week || null,
    hour: Number(row.segments?.hour || 0),
    ...metricFields(row),
  }));
}

async function collectCampaignGeography({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, geographic_view.country_criterion_id, geographic_view.location_type,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM geographic_view
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({
    country_criterion_id: String(row.geographic_view?.country_criterion_id || ""),
    location_type: row.geographic_view?.location_type || null,
    ...metricFields(row),
  }));
}

async function collectCampaignOverview({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status,
      campaign.primary_status_reasons, campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value,
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_top_impression_share,
      metrics.search_absolute_top_impression_share
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({
    campaign_id: String(row.campaign?.id || ""),
    campaign: row.campaign?.name || null,
    status: row.campaign?.status || null,
    primary_status: row.campaign?.primary_status || null,
    primary_status_reasons: row.campaign?.primary_status_reasons || [],
    channel_type: row.campaign?.advertising_channel_type || null,
    daily_budget_eur: microsToEur(row.campaign_budget?.amount_micros),
    ...metricFields(row),
    search_impression_share: numberOrNull(row.metrics?.search_impression_share),
    search_budget_lost_impression_share: numberOrNull(row.metrics?.search_budget_lost_impression_share),
    search_rank_lost_impression_share: numberOrNull(row.metrics?.search_rank_lost_impression_share),
    search_top_impression_share: numberOrNull(row.metrics?.search_top_impression_share),
    search_absolute_top_impression_share: numberOrNull(row.metrics?.search_absolute_top_impression_share),
  }));
}

async function collectCampaignAdGroups({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status,
      ad_group.primary_status, ad_group.primary_status_reasons, ad_group.type,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM ad_group
    WHERE campaign.id = ${campaignId}
      AND ad_group.status != 'REMOVED'
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({
    ad_group_id: String(row.ad_group?.id || ""),
    ad_group: row.ad_group?.name || null,
    status: row.ad_group?.status || null,
    primary_status: row.ad_group?.primary_status || null,
    primary_status_reasons: row.ad_group?.primary_status_reasons || [],
    type: row.ad_group?.type || null,
    ...metricFields(row),
  }));
}

module.exports = {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
  collectCampaignOverview,
  collectCampaignAdGroups,
};
