function numberOrZero(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function collectCampaignConversionActions({ customer, campaignId, start, end }) {
  if (!customer || typeof customer.query !== "function") throw new TypeError("customer.query is required");
  if (!/^\d{1,20}$/.test(String(campaignId || ""))) throw new TypeError("campaignId is invalid");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(end || ""))) {
    throw new TypeError("start and end must be YYYY-MM-DD");
  }

  const rows = await customer.query(`
    SELECT campaign.id,
      segments.conversion_action,
      segments.conversion_action_name,
      metrics.conversions,
      metrics.all_conversions,
      metrics.conversions_value,
      metrics.all_conversions_value
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start}' AND '${end}'
  `);

  return (rows || []).map((row) => ({
    conversion_action_resource: row.segments?.conversion_action || null,
    conversion_action_name: row.segments?.conversion_action_name || null,
    conversions: numberOrZero(row.metrics?.conversions),
    all_conversions: numberOrZero(row.metrics?.all_conversions),
    conversion_value: numberOrZero(row.metrics?.conversions_value),
    all_conversion_value: numberOrZero(row.metrics?.all_conversions_value),
  })).filter((row) => row.conversions !== 0 || row.all_conversions !== 0 || row.conversion_value !== 0 || row.all_conversion_value !== 0);
}

module.exports = { collectCampaignConversionActions };
