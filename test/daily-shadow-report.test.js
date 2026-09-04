const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeChannel, buildDailyShadowReport } = require("../daily-shadow-report");

function trustedEvidence() {
  const collectedAt = new Date().toISOString();
  return {
    access: { google_ok: true, ga4_ok: true, meta_ok: true },
    live_sources: {
      google: { collected_at: collectedAt, totals: { clicks: 10, spend_eur: 20 } },
      ga4: { collected_at: collectedAt },
      meta: { collected_at: collectedAt },
    },
  };
}

test("channel summary calculates CPC and cost per booking", () => {
  assert.deepEqual(
    summarizeChannel({ cost: 24, clicks: 12, bookings: 3, booking_semantics_verified: true }),
    { spend_eur: 24, clicks: 12, bookings: 3, observed_conversion_signals: 3, booking_semantics_verified: true, cpc_eur: 2, cost_per_booking_eur: 8 }
  );
});

test("daily report preserves zero-write contract with trusted evidence", () => {
  const report = buildDailyShadowReport({
    ...trustedEvidence(),
    conversions: { googleConversions: 10, ga4GoogleCpcBookings: 4, booking_completed: 4 },
    google: { cost: 20, clicks: 10, bookings: 0, baselineBookings: 4 },
    meta: { cost: 12, clicks: 6, bookings: 0, baselineBookings: 2 },
  });

  assert.equal(report.mode, "shadow");
  assert.equal(report.writes_allowed, false);
  assert.equal(report.spend_changed, false);
  assert.equal(report.data_quality.confidence, "high");
  report.journal.forEach((entry) => {
    assert.equal(entry.executable, false);
    assert.equal(entry.execution_status, "not_executed");
    assert.equal(entry.requires_human_approval, true);
  });
});

test("missing evidence produces repair instruction instead of optimization", () => {
  const report = buildDailyShadowReport({ google: { cost: 15, clicks: 5, bookings: 0 } });
  assert.equal(report.data_quality.ready_for_recommendations, false);
  assert.equal(report.top_priorities[0].channel, "system");
  assert.equal(report.top_priorities[0].action, "collect_or_repair_data");
});

test("stale GA4 suppresses Google recommendations without blocking Meta", () => {
  const evidence = trustedEvidence();
  evidence.live_sources.ga4.collected_at = "2020-01-01T00:00:00Z";

  const report = buildDailyShadowReport({
    ...evidence,
    conversions: { booking_completed: 1 },
    google: { cost: 30, clicks: 10, bookings: 0, baselineBookings: 4 },
    meta: { cost: 12, clicks: 6, bookings: 0, baselineBookings: 2 },
  });

  const channelDecisions = report.top_priorities
    .concat(report.observations)
    .filter((decision) => decision.channel !== "system");

  assert.equal(report.data_quality.channel_ready.google, false);
  assert.ok(channelDecisions.every((decision) => decision.channel === "meta"));
});

test("daily report does not invent cost per booking without bookings", () => {
  const report = buildDailyShadowReport({
    conversions: { googleConversions: 0, ga4GoogleCpcBookings: 0 },
    google: { cost: 15, clicks: 5, bookings: 0 },
  });
  assert.equal(report.channels.google.cost_per_booking_eur, null);
  assert.equal(report.channels.google.cpc_eur, 3);
});
