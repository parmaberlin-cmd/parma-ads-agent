function microsToEur(value) {
  return Number(value || 0) / 1_000_000;
}

function numberOrNull(value) {
  return value == null ? null : Number(value);
}

function microsToEurOrNull(value) {
  return value == null ? null : Number(value) / 1_000_000;
}

function enumName(value, names) {
  if (value == null) return null;
  if (typeof value === "string" && !/^\d+$/.test(value)) return value;
  return names[Number(value)] || String(value);
}

const STATUS = {0:"UNSPECIFIED",1:"UNKNOWN",2:"ENABLED",3:"PAUSED",4:"REMOVED"};
const PRIMARY_STATUS = {0:"UNSPECIFIED",1:"UNKNOWN",2:"ELIGIBLE",3:"PAUSED",4:"REMOVED",5:"ENDED",6:"PENDING",7:"MISCONFIGURED",8:"LIMITED",9:"LEARNING",10:"NOT_ELIGIBLE"};
const CHANNEL = {0:"UNSPECIFIED",1:"UNKNOWN",2:"SEARCH",3:"DISPLAY",4:"SHOPPING",5:"HOTEL",6:"VIDEO",7:"MULTI_CHANNEL",8:"LOCAL",9:"SMART",10:"PERFORMANCE_MAX",11:"LOCAL_SERVICES",13:"TRAVEL",14:"DEMAND_GEN"};
const AD_GROUP_TYPE = {0:"UNSPECIFIED",1:"UNKNOWN",2:"SEARCH_STANDARD",3:"DISPLAY_STANDARD",4:"SHOPPING_PRODUCT_ADS",6:"HOTEL_ADS",13:"SEARCH_DYNAMIC_ADS",16:"VIDEO_RESPONSIVE"};
const KEYWORD_MATCH = {0:"UNSPECIFIED",1:"UNKNOWN",2:"EXACT",3:"PHRASE",4:"BROAD"};
const DEVICE = {0:"UNSPECIFIED",1:"UNKNOWN",2:"MOBILE",3:"TABLET",4:"DESKTOP",5:"CONNECTED_TV",6:"OTHER"};
const DAY = {0:"UNSPECIFIED",1:"UNKNOWN",2:"MONDAY",3:"TUESDAY",4:"WEDNESDAY",5:"THURSDAY",6:"FRIDAY",7:"SATURDAY",8:"SUNDAY"};
const GEO_TYPE = {0:"UNSPECIFIED",1:"UNKNOWN",2:"AREA_OF_INTEREST",3:"LOCATION_OF_PRESENCE"};
const CRITERION_TYPE = {0:"UNSPECIFIED",1:"UNKNOWN",2:"KEYWORD",3:"PLACEMENT",4:"MOBILE_APP_CATEGORY",5:"MOBILE_APPLICATION",6:"BRAND",7:"LOCATION",8:"DEVICE",9:"AD_SCHEDULE",10:"AGE_RANGE",11:"GENDER",12:"INCOME_RANGE",13:"PARENTAL_STATUS",14:"YOUTUBE_VIDEO",15:"YOUTUBE_CHANNEL",16:"USER_LIST",17:"PROXIMITY",18:"TOPIC",19:"LISTING_SCOPE",20:"LANGUAGE"};

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

function normalizePolicyTopicEntries(entries) {
  return (entries || []).map((entry) => ({
    topic: entry?.topic || null,
    type: entry?.type || null,
    evidences: (entry?.evidences || []).map((evidence) => ({
      text_list: evidence?.text_list || null,
      website_list: evidence?.website_list || null,
      destination_text_list: evidence?.destination_text_list || null,
    })),
  }));
}

async function collectCampaignSearchTerms({ customer, campaignId, start, end }) {
  validateInput({ customer, campaignId, start, end });
  const rows = await customer.query(`
    SELECT campaign.id, ad_group.id, ad_group.name, search_term_view.search_term,
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
    match_type: enumName(row.segments?.keyword?.info?.match_type, KEYWORD_MATCH),
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
    match_type: enumName(row.ad_group_criterion?.keyword?.match_type, KEYWORD_MATCH),
    status: enumName(row.ad_group_criterion?.status, STATUS),
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
  return (rows || []).map((row) => ({ device: enumName(row.segments?.device, DEVICE) || "UNKNOWN", ...metricFields(row) }));
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
    day_of_week: enumName(row.segments?.day_of_week, DAY),
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
    location_type: enumName(row.geographic_view?.location_type, GEO_TYPE),
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
    status: enumName(row.campaign?.status, STATUS),
    primary_status: enumName(row.campaign?.primary_status, PRIMARY_STATUS),
    primary_status_reasons: row.campaign?.primary_status_reasons || [],
    channel_type: enumName(row.campaign?.advertising_channel_type, CHANNEL),
    daily_budget_eur: microsToEur(row.campaign_budget?.amount_micros),
    ...metricFields(row),
    search_impression_share: numberOrNull(row.metrics?.search_impression_share),
    search_budget_lost_impression_share: numberOrNull(row.metrics?.search_budget_lost_impression_share),
    search_rank_lost_impression_share: numberOrNull(row.metrics?.search_rank_lost_impression_share),
    search_top_impression_share: numberOrNull(row.metrics?.search_top_impression_share),
    search_absolute_top_impression_share: numberOrNull(row.metrics?.search_absolute_top_impression_share),
  }));
}

async function collectCampaignNegativeKeywords({ customer, campaignId }) {
  if (!customer || typeof customer.query !== "function") throw new TypeError("customer.query is required");
  if (!/^\d{1,20}$/.test(String(campaignId || ""))) throw new TypeError("campaignId is invalid");
  const [campaignRows, adGroupRows] = await Promise.all([
    customer.query(`
      SELECT campaign.id, campaign_criterion.criterion_id,
        campaign_criterion.keyword.text, campaign_criterion.keyword.match_type,
        campaign_criterion.status, campaign_criterion.negative
      FROM campaign_criterion
      WHERE campaign.id = ${campaignId}
        AND campaign_criterion.type = 'KEYWORD'
        AND campaign_criterion.negative = TRUE
        AND campaign_criterion.status != 'REMOVED'
    `),
    customer.query(`
      SELECT campaign.id, ad_group.id, ad_group.name,
        ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type, ad_group_criterion.status,
        ad_group_criterion.negative
      FROM ad_group_criterion
      WHERE campaign.id = ${campaignId}
        AND ad_group_criterion.type = 'KEYWORD'
        AND ad_group_criterion.negative = TRUE
        AND ad_group_criterion.status != 'REMOVED'
    `),
  ]);
  return [
    ...(campaignRows || []).map((row) => ({
      level: "CAMPAIGN", criterion_id: String(row.campaign_criterion?.criterion_id || ""),
      keyword: row.campaign_criterion?.keyword?.text || null,
      match_type: enumName(row.campaign_criterion?.keyword?.match_type, KEYWORD_MATCH),
      status: enumName(row.campaign_criterion?.status, STATUS), negative: row.campaign_criterion?.negative === true,
    })),
    ...(adGroupRows || []).map((row) => ({
      level: "AD_GROUP", ad_group_id: String(row.ad_group?.id || ""), ad_group: row.ad_group?.name || null,
      criterion_id: String(row.ad_group_criterion?.criterion_id || ""),
      keyword: row.ad_group_criterion?.keyword?.text || null,
      match_type: enumName(row.ad_group_criterion?.keyword?.match_type, KEYWORD_MATCH),
      status: enumName(row.ad_group_criterion?.status, STATUS), negative: row.ad_group_criterion?.negative === true,
    })),
  ];
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
    status: enumName(row.ad_group?.status, STATUS),
    primary_status: enumName(row.ad_group?.primary_status, PRIMARY_STATUS),
    primary_status_reasons: row.ad_group?.primary_status_reasons || [],
    type: enumName(row.ad_group?.type, AD_GROUP_TYPE),
    ...metricFields(row),
  }));
}

async function collectCampaignConfiguredDiagnostics({ customer, campaignId }) {
  if (!customer || typeof customer.query !== "function") throw new TypeError("customer.query is required");
  if (!/^\d{1,20}$/.test(String(campaignId || ""))) throw new TypeError("campaignId is invalid");
  const [campaignRows, criteriaRows, adScheduleRows, locationRows, languageRows, adGroupRows, keywordRows, campaignNegativeRows] = await Promise.all([
    customer.query(`
      SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status,
        campaign.primary_status, campaign.primary_status_reasons,
        campaign.advertising_channel_type, campaign.bidding_strategy_type,
        campaign.target_cpa.target_cpa_micros, campaign.target_roas.target_roas,
        campaign.maximize_conversions.target_cpa_micros,
        campaign.maximize_conversion_value.target_roas,
        campaign.manual_cpc.enhanced_cpc_enabled,
        campaign.campaign_budget, campaign_budget.id, campaign_budget.name,
        campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.status
      FROM campaign
      WHERE campaign.id = ${campaignId}
      LIMIT 1
    `),
    customer.query(`
      SELECT campaign_criterion.criterion_id, campaign_criterion.type,
        campaign_criterion.status, campaign_criterion.negative
      FROM campaign_criterion
      WHERE campaign.id = ${campaignId}
        AND campaign_criterion.status != 'REMOVED'
    `),
    customer.query(`
      SELECT campaign_criterion.criterion_id, campaign_criterion.status,
        campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour,
        campaign_criterion.ad_schedule.start_minute, campaign_criterion.ad_schedule.end_hour,
        campaign_criterion.ad_schedule.end_minute
      FROM campaign_criterion
      WHERE campaign.id = ${campaignId}
        AND campaign_criterion.type = 'AD_SCHEDULE'
        AND campaign_criterion.status != 'REMOVED'
    `),
    customer.query(`
      SELECT campaign_criterion.criterion_id, campaign_criterion.type,
        campaign_criterion.status, campaign_criterion.negative,
        campaign_criterion.location.geo_target_constant,
        campaign_criterion.proximity.radius, campaign_criterion.proximity.radius_units
      FROM campaign_criterion
      WHERE campaign.id = ${campaignId}
        AND campaign_criterion.type IN ('LOCATION', 'PROXIMITY')
        AND campaign_criterion.status != 'REMOVED'
    `),
    customer.query(`
      SELECT campaign_criterion.criterion_id, campaign_criterion.status,
        campaign_criterion.negative, campaign_criterion.language.language_constant
      FROM campaign_criterion
      WHERE campaign.id = ${campaignId}
        AND campaign_criterion.type = 'LANGUAGE'
        AND campaign_criterion.status != 'REMOVED'
    `),
    customer.query(`
      SELECT ad_group.id, ad_group.name, ad_group.status,
        ad_group.primary_status, ad_group.primary_status_reasons
      FROM ad_group
      WHERE campaign.id = ${campaignId}
        AND ad_group.status != 'REMOVED'
    `),
    customer.query(`
      SELECT ad_group.id, ad_group.name, ad_group_criterion.criterion_id,
        ad_group_criterion.status, ad_group_criterion.primary_status,
        ad_group_criterion.primary_status_reasons,
        ad_group_criterion.system_serving_status,
        ad_group_criterion.approval_status,
        ad_group_criterion.policy_summary.approval_status,
        ad_group_criterion.policy_summary.review_status,
        ad_group_criterion.policy_summary.policy_topic_entries,
        ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        ad_group_criterion.negative
      FROM ad_group_criterion
      WHERE campaign.id = ${campaignId}
        AND ad_group_criterion.type = 'KEYWORD'
        AND ad_group_criterion.status != 'REMOVED'
    `),
    customer.query(`
      SELECT campaign_criterion.criterion_id, campaign_criterion.status,
        campaign_criterion.keyword.text, campaign_criterion.keyword.match_type
      FROM campaign_criterion
      WHERE campaign.id = ${campaignId}
        AND campaign_criterion.type = 'KEYWORD'
        AND campaign_criterion.negative = TRUE
        AND campaign_criterion.status != 'REMOVED'
    `),
  ]);
  const campaign = campaignRows?.[0] || {};
  const criteriaByType = {};
  for (const row of criteriaRows || []) {
    const key = enumName(row.campaign_criterion?.type, CRITERION_TYPE) || 'UNKNOWN';
    criteriaByType[key] = (criteriaByType[key] || 0) + 1;
  }
  const keywordDiagnostics = (keywordRows || []).map((row) => ({
    ad_group_id: String(row.ad_group?.id || ""),
    ad_group: row.ad_group?.name || null,
    criterion_id: String(row.ad_group_criterion?.criterion_id || ""),
    keyword: row.ad_group_criterion?.keyword?.text || null,
    match_type: enumName(row.ad_group_criterion?.keyword?.match_type, KEYWORD_MATCH),
    negative: row.ad_group_criterion?.negative === true,
    status: enumName(row.ad_group_criterion?.status, STATUS),
    primary_status: enumName(row.ad_group_criterion?.primary_status, PRIMARY_STATUS),
    primary_status_reasons: row.ad_group_criterion?.primary_status_reasons || [],
    serving_status: row.ad_group_criterion?.system_serving_status || null,
    approval_status: row.ad_group_criterion?.approval_status || null,
    policy: {
      approval_status: row.ad_group_criterion?.policy_summary?.approval_status || null,
      review_status: row.ad_group_criterion?.policy_summary?.review_status || null,
      topics: normalizePolicyTopicEntries(row.ad_group_criterion?.policy_summary?.policy_topic_entries),
    },
  }));
  const positiveKeywordIndex = new Set(keywordDiagnostics.filter((entry) => !entry.negative && entry.keyword).map((entry) => String(entry.keyword).trim().toLowerCase()));
  const campaignNegativeKeywords = (campaignNegativeRows || []).map((row) => ({
    criterion_id: String(row.campaign_criterion?.criterion_id || ""),
    status: enumName(row.campaign_criterion?.status, STATUS),
    keyword: row.campaign_criterion?.keyword?.text || null,
    match_type: enumName(row.campaign_criterion?.keyword?.match_type, KEYWORD_MATCH),
  }));
  const negativeKeywordConflicts = [
    ...keywordDiagnostics
      .filter((entry) => entry.negative && entry.keyword)
      .map((entry) => ({
        keyword: entry.keyword,
        match_type: entry.match_type,
        level: 'AD_GROUP_KEYWORD',
        ad_group_id: entry.ad_group_id || null,
      })),
    ...campaignNegativeKeywords
      .filter((entry) => entry.keyword)
      .map((entry) => ({
        keyword: entry.keyword,
        match_type: entry.match_type,
        level: 'CAMPAIGN_KEYWORD',
        ad_group_id: null,
      })),
  ]
    .map((entry) => {
      const key = String(entry.keyword).trim().toLowerCase();
      if (!positiveKeywordIndex.has(key)) return null;
      return {
        keyword: entry.keyword,
        match_type: entry.match_type,
        conflict_type: 'same_keyword_text_positive_and_negative',
        level: entry.level,
        ad_group_id: entry.ad_group_id,
      };
    })
    .filter(Boolean);
  return {
    campaign: {
      campaign_id: String(campaign.campaign?.id || ""),
      campaign: campaign.campaign?.name || null,
      status: enumName(campaign.campaign?.status, STATUS),
      serving_status: campaign.campaign?.serving_status || null,
      primary_status: enumName(campaign.campaign?.primary_status, PRIMARY_STATUS),
      primary_status_reasons: campaign.campaign?.primary_status_reasons || [],
      channel_type: enumName(campaign.campaign?.advertising_channel_type, CHANNEL),
      bidding_strategy: {
        type: campaign.campaign?.bidding_strategy_type || null,
        target_cpa_eur: microsToEurOrNull(campaign.campaign?.target_cpa?.target_cpa_micros),
        target_roas: numberOrNull(campaign.campaign?.target_roas?.target_roas),
        maximize_conversions_target_cpa_eur: microsToEurOrNull(campaign.campaign?.maximize_conversions?.target_cpa_micros),
        maximize_conversion_value_target_roas: numberOrNull(campaign.campaign?.maximize_conversion_value?.target_roas),
        manual_cpc_enhanced: campaign.campaign?.manual_cpc?.enhanced_cpc_enabled === true,
      },
      budget: {
        campaign_budget_resource: campaign.campaign?.campaign_budget || null,
        budget_id: String(campaign.campaign_budget?.id || ""),
        budget_name: campaign.campaign_budget?.name || null,
        amount_eur: microsToEur(campaign.campaign_budget?.amount_micros),
        explicitly_shared: campaign.campaign_budget?.explicitly_shared === true,
        status: campaign.campaign_budget?.status || null,
      },
    },
    campaign_criteria_summary: {
      configured_count: (criteriaRows || []).length,
      by_type: criteriaByType,
    },
    ad_schedule: (adScheduleRows || []).map((row) => ({
      criterion_id: String(row.campaign_criterion?.criterion_id || ""),
      status: enumName(row.campaign_criterion?.status, STATUS),
      day_of_week: enumName(row.campaign_criterion?.ad_schedule?.day_of_week, DAY),
      start_hour: Number(row.campaign_criterion?.ad_schedule?.start_hour || 0),
      start_minute: row.campaign_criterion?.ad_schedule?.start_minute || null,
      end_hour: Number(row.campaign_criterion?.ad_schedule?.end_hour || 0),
      end_minute: row.campaign_criterion?.ad_schedule?.end_minute || null,
    })),
    location_targeting: (locationRows || []).map((row) => ({
      criterion_id: String(row.campaign_criterion?.criterion_id || ""),
      type: row.campaign_criterion?.type || null,
      status: enumName(row.campaign_criterion?.status, STATUS),
      negative: row.campaign_criterion?.negative === true,
      geo_target_constant: row.campaign_criterion?.location?.geo_target_constant || null,
      proximity_radius: numberOrNull(row.campaign_criterion?.proximity?.radius),
      proximity_radius_units: row.campaign_criterion?.proximity?.radius_units || null,
    })),
    language_targeting: (languageRows || []).map((row) => ({
      criterion_id: String(row.campaign_criterion?.criterion_id || ""),
      status: enumName(row.campaign_criterion?.status, STATUS),
      negative: row.campaign_criterion?.negative === true,
      language_constant: row.campaign_criterion?.language?.language_constant || null,
    })),
    ad_group_statuses: (adGroupRows || []).map((row) => ({
      ad_group_id: String(row.ad_group?.id || ""),
      ad_group: row.ad_group?.name || null,
      status: enumName(row.ad_group?.status, STATUS),
      primary_status: enumName(row.ad_group?.primary_status, PRIMARY_STATUS),
      primary_status_reasons: row.ad_group?.primary_status_reasons || [],
    })),
    keyword_diagnostics: keywordDiagnostics,
    campaign_negative_keywords: campaignNegativeKeywords,
    negative_keyword_conflicts: negativeKeywordConflicts,
  };
}

module.exports = {
  collectCampaignSearchTerms,
  collectCampaignKeywords,
  collectCampaignDevices,
  collectCampaignHours,
  collectCampaignGeography,
  collectCampaignOverview,
  collectCampaignAdGroups,
  collectCampaignNegativeKeywords,
  collectCampaignConfiguredDiagnostics,
};
