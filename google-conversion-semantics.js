function numberOrZero(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function validateDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw new TypeError(`${name} must be YYYY-MM-DD`);
}

async function collectCustomerTimeZone({ customer }) {
  if (!customer || typeof customer.query !== "function") throw new TypeError("customer.query is required");
  const rows = await customer.query(`SELECT customer.id, customer.time_zone FROM customer LIMIT 1`);
  const row = (rows || [])[0] || {};
  return { customer_id: row.customer?.id ? String(row.customer.id) : null, time_zone: row.customer?.time_zone || null };
}

async function collectConversionActionMetadata({ customer, resourceName }) {
  if (!customer || typeof customer.query !== "function") throw new TypeError("customer.query is required");
  if (!/^customers\/\d+\/conversionActions\/\d+$/.test(String(resourceName || ""))) throw new TypeError("resourceName is invalid");
  const rows = await customer.query(`
    SELECT conversion_action.resource_name,
      conversion_action.name,
      conversion_action.status,
      conversion_action.type,
      conversion_action.origin,
      conversion_action.category,
      conversion_action.primary_for_goal,
      conversion_action.counting_type,
      conversion_action.click_through_lookback_window_days,
      conversion_action.view_through_lookback_window_days,
      conversion_action.attribution_model_settings.attribution_model,
      conversion_action.google_analytics_4_settings.event_name,
      conversion_action.google_analytics_4_settings.property_id
    FROM conversion_action
    WHERE conversion_action.resource_name = '${resourceName}'
    LIMIT 1
  `);
  const action = (rows || [])[0]?.conversion_action || {};
  return {
    resource_name: action.resource_name || resourceName,
    name: action.name || null,
    status: action.status || null,
    type: action.type || null,
    origin: action.origin || null,
    category: action.category || null,
    primary_for_goal: typeof action.primary_for_goal === "boolean" ? action.primary_for_goal : null,
    counting_type: action.counting_type || null,
    click_through_lookback_window_days: action.click_through_lookback_window_days ?? null,
    view_through_lookback_window_days: action.view_through_lookback_window_days ?? null,
    attribution_model: action.attribution_model_settings?.attribution_model || null,
    ga4_event_name: action.google_analytics_4_settings?.event_name || null,
    ga4_property_id: action.google_analytics_4_settings?.property_id ? String(action.google_analytics_4_settings.property_id) : null,
  };
}

async function collectCampaignConversionsByConversionDate({ customer, campaignId, start, end }) {
  if (!customer || typeof customer.query !== "function") throw new TypeError("customer.query is required");
  if (!/^\d{1,20}$/.test(String(campaignId || ""))) throw new TypeError("campaignId is invalid");
  validateDate(start, "start"); validateDate(end, "end");
  const rows = await customer.query(`
    SELECT campaign.id,
      segments.date,
      metrics.conversions_by_conversion_date,
      metrics.all_conversions_by_conversion_date
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
    ORDER BY segments.date
  `);
  return (rows || []).map((row) => ({
    date: row.segments?.date || null,
    conversions_by_conversion_date: numberOrZero(row.metrics?.conversions_by_conversion_date),
    all_conversions_by_conversion_date: numberOrZero(row.metrics?.all_conversions_by_conversion_date),
  }));
}

module.exports = {
  collectCustomerTimeZone,
  collectConversionActionMetadata,
  collectCampaignConversionsByConversionDate,
};
