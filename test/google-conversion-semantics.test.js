const test = require("node:test");
const assert = require("node:assert/strict");
const {
  collectCustomerTimeZone,
  collectConversionActionMetadata,
  collectCampaignConversionsByConversionDate,
} = require("../google-conversion-semantics");

function customerReturning(rows, capture = {}) {
  return { query: async (q) => { capture.query = q; return rows; } };
}

test("collectCustomerTimeZone returns account timezone", async () => {
  const out = await collectCustomerTimeZone({ customer: customerReturning([{ customer: { id: "123", time_zone: "Europe/Berlin" } }]) });
  assert.deepEqual(out, { customer_id: "123", time_zone: "Europe/Berlin" });
});

test("collectConversionActionMetadata exposes semantics without writes", async () => {
  const capture = {};
  const out = await collectConversionActionMetadata({
    customer: customerReturning([{ conversion_action: {
      resource_name: "customers/123/conversionActions/456", name: "booking_completed", status: "ENABLED",
      type: "GOOGLE_ANALYTICS_4_CUSTOM", origin: "GOOGLE_ANALYTICS", category: "PURCHASE",
      primary_for_goal: true, include_in_conversions_metric: true, counting_type: "ONE_PER_CLICK", click_through_lookback_window_days: 30,
      view_through_lookback_window_days: 1, attribution_model_settings: { attribution_model: "GOOGLE_ADS_DATA_DRIVEN", data_driven_model_status: "AVAILABLE" },
      google_analytics_4_settings: { event_name: "booking_completed", property_id: "999" },
    } }], capture),
    resourceName: "customers/123/conversionActions/456",
  });
  assert.equal(out.ga4_event_name, "booking_completed");
  assert.equal(out.primary_for_goal, true);
  assert.equal(out.include_in_conversions_metric, true);
  assert.equal(out.data_driven_model_status, "AVAILABLE");
  assert.match(capture.query, /^\s*SELECT/i);
  assert.doesNotMatch(capture.query, /\b(MUTATE|UPDATE|CREATE|REMOVE)\b/i);
});

test("collectCampaignConversionsByConversionDate preserves conversion-date action series", async () => {
  const capture = {};
  const out = await collectCampaignConversionsByConversionDate({
    customer: customerReturning([{ segments: { date: "2026-08-02", conversion_action: "customers/123/conversionActions/456", conversion_action_name: "booking_completed" }, metrics: { conversions_by_conversion_date: 2, all_conversions_by_conversion_date: 3 } }], capture),
    campaignId: "23276824770", start: "2026-08-02", end: "2026-08-31",
  });
  assert.deepEqual(out, [{
    date: "2026-08-02", date_basis: "conversion_date",
    conversion_action_resource: "customers/123/conversionActions/456", conversion_action_name: "booking_completed",
    conversions_by_conversion_date: 2, all_conversions_by_conversion_date: 3,
  }]);
  assert.match(capture.query, /segments\.conversion_action/);
  assert.match(capture.query, /segments\.conversion_action_name/);
  assert.doesNotMatch(capture.query, /\b(MUTATE|UPDATE|CREATE|REMOVE)\b/i);
});

test("conversion-date collector fails closed on invalid campaign/date", async () => {
  const customer = customerReturning([]);
  await assert.rejects(() => collectCampaignConversionsByConversionDate({ customer, campaignId: "x", start: "2026-08-02", end: "2026-08-31" }), /campaignId/);
  await assert.rejects(() => collectCampaignConversionsByConversionDate({ customer, campaignId: "1", start: "bad", end: "2026-08-31" }), /start/);
});
