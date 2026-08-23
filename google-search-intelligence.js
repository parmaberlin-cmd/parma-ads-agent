function microsToEur(value) {
  return Number(value || 0) / 1_000_000;
}

function metrics(row) {
  return {
    impressions: Number(row.metrics?.impressions || 0),
    clicks: Number(row.metrics?.clicks || 0),
    cost_eur: microsToEur(row.metrics?.cost_micros),
    conversions: Number(row.metrics?.conversions || 0),
    conversion_value: Number(row.metrics?.conversions_value || 0),
  };
}

function validateCollectorInput({ customer, start, end }) {
  if (!customer || typeof customer.query !== "function") throw new TypeError("customer.query is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(end || ""))) {
    throw new TypeError("start and end must be YYYY-MM-DD");
  }
}

async function collectGoogleSearchTerms({ customer, start, end }) {
  validateCollectorInput({ customer, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, campaign.name, ad_group.id, ad_group.name,
      search_term_view.search_term, search_term_view.status,
      segments.keyword.info.text, segments.keyword.info.match_type,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.conversions, metrics.conversions_value
    FROM search_term_view
    WHERE segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({
    campaign_id: String(row.campaign?.id || ""),
    campaign_name: row.campaign?.name || null,
    ad_group_id: String(row.ad_group?.id || ""),
    ad_group_name: row.ad_group?.name || null,
    search_term: row.search_term_view?.search_term || null,
    status: row.search_term_view?.status || null,
    matched_keyword: row.segments?.keyword?.info?.text || null,
    matched_keyword_match_type: row.segments?.keyword?.info?.match_type || null,
    ...metrics(row),
  }));
}

async function collectGoogleKeywords({ customer, start, end }) {
  validateCollectorInput({ customer, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, campaign.name, ad_group.id, ad_group.name,
      ad_group_criterion.criterion_id, ad_group_criterion.status,
      ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
      ad_group_criterion.negative,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.average_cpc, metrics.conversions, metrics.conversions_value
    FROM keyword_view
    WHERE ad_group_criterion.status != 'REMOVED'
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);
  return (rows || []).map((row) => ({
    campaign_id: String(row.campaign?.id || ""),
    campaign_name: row.campaign?.name || null,
    ad_group_id: String(row.ad_group?.id || ""),
    ad_group_name: row.ad_group?.name || null,
    criterion_id: String(row.ad_group_criterion?.criterion_id || ""),
    keyword: row.ad_group_criterion?.keyword?.text || null,
    match_type: row.ad_group_criterion?.keyword?.match_type || null,
    status: row.ad_group_criterion?.status || null,
    negative: Boolean(row.ad_group_criterion?.negative),
    average_cpc_eur: microsToEur(row.metrics?.average_cpc),
    ...metrics(row),
  }));
}

function analyzeSearchTerms(searchTerms = []) {
  return searchTerms.map((term) => {
    let signal = "insufficient_data";
    if (term.conversions > 0) signal = "productive";
    else if (term.clicks >= 5 || term.cost_eur >= 5) signal = "review_for_negative";
    return { ...term, signal };
  });
}

function analyzeKeywords(keywords = []) {
  return keywords.map((keyword) => {
    let signal = "insufficient_data";
    if (keyword.conversions > 0) signal = "productive";
    else if (keyword.clicks >= 8 || keyword.cost_eur >= 8) signal = "underperforming_review";
    return { ...keyword, signal };
  });
}

module.exports = { collectGoogleSearchTerms, collectGoogleKeywords, analyzeSearchTerms, analyzeKeywords };
