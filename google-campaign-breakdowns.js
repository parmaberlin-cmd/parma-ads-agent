function microsToEur(value) {
  return Number(value || 0) / 1_000_000;
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
    search_term: row.search_term_view?.search_term || null,
    matched_keyword: row.segments?.keyword?.info?.text || null,
    match_type: row.segments?.keyword?.info?.match_type || null,
    ...metricFields(row),
  }));
}

async function collectCampaignKeywords({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
      ad_group_criterion.status, metrics.impressions, metrics.clicks,
      metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM keyword_view
    WHERE campaign.id = ${campaignId}
      AND ad_group_criterion.status != 'REMOVED'
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({
    keyword: row.ad_group_criterion?.keyword?.text || null,
    match_type: row.ad_group_criterion?.keyword?.match_type || null,
    status: row.ad_group_criterion?.status || null,
    ...metricFields(row),
  }));
}

async function collectCampaignDevices({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT segments.device, metrics.impressions, metrics.clicks,
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
    SELECT segments.day_of_week, segments.hour, metrics.impressions, metrics.clicks,
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
    SELECT geographic_view.country_criterion_id, geographic_view.location_type,
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

module.exports = {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
};
