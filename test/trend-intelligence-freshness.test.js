const test = require("node:test");
const assert = require("node:assert/strict");
const { detectTrackingAnomaly } = require("../trend-intelligence");

test("tracking freshness uses collector time instead of latest conversion time", () => {
  const anomalies = detectTrackingAnomaly({
    googleConversions: 5,
    ga4Bookings: 5,
    googleLastSeenAt: "2026-08-20T12:00:00Z",
    ga4LastSeenAt: "2026-08-20T12:00:00Z",
    googleCollectedAt: "2026-08-26T08:55:00Z",
    ga4CollectedAt: "2026-08-26T08:55:00Z",
    now: new Date("2026-08-26T09:00:00Z"),
  });
  assert.deepEqual(anomalies, []);
});

test("stale collector still raises a tracking anomaly", () => {
  const anomalies = detectTrackingAnomaly({
    googleConversions: 5,
    ga4Bookings: 5,
    googleCollectedAt: "2026-08-20T12:00:00Z",
    ga4CollectedAt: "2026-08-20T12:00:00Z",
    now: new Date("2026-08-26T09:00:00Z"),
  });
  assert.deepEqual(anomalies.map((item) => item.code), ["GOOGLE_CONVERSION_DATA_STALE", "GA4_CONVERSION_DATA_STALE"]);
});
