const test = require("node:test");
const assert = require("node:assert/strict");
const { collectFullLiveShadowInput } = require("../full-live-shadow-data");

test("full live input never fabricates Google conversion freshness from aggregate conversions", async () => {
  const now = new Date("2026-08-22T20:00:00Z");
  const result = await collectFullLiveShadowInput({
    now,
    collectBase: async () => ({
      now: now.toISOString(),
      conversions: { google_ads_conversions: 4, google_last_seen_at: now.toISOString() },
      access: { google_ok: true, meta_ok: true },
      live_sources: { google: { access_ok: true, totals: { conversions: 4 } } },
    }),
    collectGa4: async () => ({ access_ok: true, google_cpc_booking_completed: 4, total_booking_completed: 5, last_seen_at: "2026-08-21T12:00:00.000Z", reservation_funnel: {}, funnel_access: {} }),
  });
  assert.equal(result.conversions.google_last_seen_at, null);
});

test("full live input preserves an exact Google conversion timestamp when collector provides one", async () => {
  const exact = "2026-08-20T12:00:00.000Z";
  const result = await collectFullLiveShadowInput({
    collectBase: async () => ({ conversions: { google_ads_conversions: 2 }, access: {}, live_sources: { google: { last_conversion_at: exact } } }),
    collectGa4: async () => ({ access_ok: false }),
  });
  assert.equal(result.conversions.google_last_seen_at, exact);
});
