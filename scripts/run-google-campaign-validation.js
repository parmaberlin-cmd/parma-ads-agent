const DEFAULT_BASE_URL = "https://supportive-stillness-production-ec37.up.railway.app";
const DEFAULT_CAMPAIGN_ID = "23276824770";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function closeEnough(actual, expected, tolerance = 0.0001) {
  return Math.abs(finite(actual) - finite(expected)) <= tolerance;
}

function summarizeMetrics(rows = []) {
  const totals = rows.reduce(
    (sum, row) => ({
      impressions: sum.impressions + finite(row.impressions),
      clicks: sum.clicks + finite(row.clicks),
      cost_eur: sum.cost_eur + finite(row.cost_eur),
      conversions: sum.conversions + finite(row.conversions),
      conversion_value: sum.conversion_value + finite(row.conversion_value),
    }),
    { impressions: 0, clicks: 0, cost_eur: 0, conversions: 0, conversion_value: 0 }
  );
  const expectedCtr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  const expectedCpc = totals.clicks > 0 ? totals.cost_eur / totals.clicks : 0;
  const reportedCtr = rows.length === 1 ? finite(rows[0].ctr) : expectedCtr;
  const reportedCpc = rows.length === 1 ? finite(rows[0].average_cpc_eur) : expectedCpc;
  return {
    row_count: rows.length,
    totals: {
      impressions: totals.impressions,
      clicks: totals.clicks,
      cost_eur: Number(totals.cost_eur.toFixed(2)),
      conversions: Number(totals.conversions.toFixed(2)),
      conversion_value: Number(totals.conversion_value.toFixed(2)),
      ctr_percent: Number((expectedCtr * 100).toFixed(2)),
      average_cpc_eur: Number(expectedCpc.toFixed(2)),
    },
    consistency: {
      non_negative: Object.values(totals).every((value) => value >= 0),
      clicks_not_above_impressions: totals.clicks <= totals.impressions,
      ctr_matches: closeEnough(reportedCtr, expectedCtr),
      average_cpc_matches: closeEnough(reportedCpc, expectedCpc, 0.01),
    },
  };
}

async function requestJson(fetchImpl, url, apiKey) {
  const response = await fetchImpl(url, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(`backend_http_${response.status}`);
  return payload;
}

async function validateGoogleCampaign({
  fetchImpl = fetch,
  baseUrl = DEFAULT_BASE_URL,
  apiKey,
  campaignId = DEFAULT_CAMPAIGN_ID,
  days = 30,
} = {}) {
  if (typeof apiKey !== "string" || !apiKey) throw new Error("api_key_missing");
  if (!/^\d{1,20}$/.test(String(campaignId))) throw new Error("campaign_id_invalid");
  if (!Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 90) throw new Error("days_invalid");

  const root = String(baseUrl).replace(/\/$/, "");
  const connection = await requestJson(fetchImpl, `${root}/tools/google/test`, apiKey);
  if (connection.success !== true || connection.connected !== true) throw new Error("google_connection_not_confirmed");

  const result = await requestJson(
    fetchImpl,
    `${root}/tools/google/campaign/${campaignId}/metrics?days=${Number(days)}`,
    apiKey
  );
  if (result.success !== true || !Array.isArray(result.metrics)) throw new Error("campaign_metrics_invalid");

  const summary = summarizeMetrics(result.metrics);
  const consistencyGreen = Object.values(summary.consistency).every(Boolean);
  return {
    success: consistencyGreen,
    mode: "google_campaign_read_only_validation",
    access_ok: true,
    period_days: Number(days),
    delivery_status: result.status === "has_data" ? "has_data" : "no_data",
    ...summary,
    writes_allowed: false,
    execution_allowed: false,
    spend_allowed: false,
  };
}

if (require.main === module) {
  validateGoogleCampaign({
    apiKey: process.env.PARMA_AGENT_API_KEY,
    campaignId: process.env.GOOGLE_VALIDATION_CAMPAIGN_ID || DEFAULT_CAMPAIGN_ID,
    days: Number(process.env.GOOGLE_VALIDATION_DAYS || 30),
  })
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = result.success ? 0 : 1;
    })
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ success:false, mode:"google_campaign_read_only_validation", error:String(error.message || "validation_failed").replace(/[^a-z0-9_:-]/gi,"_").slice(0,80), writes_allowed:false, execution_allowed:false, spend_allowed:false })}\n`);
      process.exitCode = 1;
    });
}

module.exports = { finite, closeEnough, summarizeMetrics, validateGoogleCampaign };
