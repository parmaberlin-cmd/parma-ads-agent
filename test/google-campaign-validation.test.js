const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeMetrics, validateGoogleCampaign } = require("../scripts/run-google-campaign-validation");

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("campaign validator emits only aggregate read-only evidence", async () => {
  const calls = [];
  const result = await validateGoogleCampaign({
    apiKey: "hidden-test-key",
    campaignId: "23276824770",
    days: 7,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/tools/google/test")) return response({ success: true, connected: true, account: { id: "private" } });
      return response({
        success: true,
        status: "has_data",
        metrics: [{ campaign_id:"private", campaign_name:"private", impressions:100, clicks:5, cost_eur:2.5, ctr:0.05, average_cpc_eur:0.5, conversions:1, conversion_value:10 }],
      });
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.totals.ctr_percent, 5);
  assert.equal(result.totals.average_cpc_eur, 0.5);
  assert.equal(result.writes_allowed, false);
  assert.equal("campaign_id" in result, false);
  assert.equal("campaign_name" in result, false);
  assert.equal(JSON.stringify(result).includes("hidden-test-key"), false);
  assert.equal(calls.every((call) => call.options.headers["x-api-key"] === "hidden-test-key"), true);
});

test("metric consistency rejects impossible delivery", () => {
  const result = summarizeMetrics([{ impressions: 4, clicks: 5, cost_eur: 2, ctr: 1.25, average_cpc_eur: 0.4 }]);
  assert.equal(result.consistency.clicks_not_above_impressions, false);
});

test("missing API key fails before network access", async () => {
  let called = false;
  await assert.rejects(
    validateGoogleCampaign({ apiKey:"", fetchImpl:async()=>{called=true;} }),
    /api_key_missing/
  );
  assert.equal(called, false);
});
