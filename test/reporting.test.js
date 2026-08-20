const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildGoogleReadiness,
  buildMetaOverview,
  classifyCampaignDelivery,
  normalizeMetaInsight,
} = require("../reporting");

test("normalizes Meta numeric strings and preserves raw action types", () => {
  const result = normalizeMetaInsight({
    campaign_id: "123",
    campaign_name: "Dinner",
    spend: "12.345",
    impressions: "1000",
    clicks: "25",
    ctr: "2.5",
    actions: [{ action_type: "link_click", value: "8" }],
  });

  assert.equal(result.spend_eur, 12.35);
  assert.equal(result.impressions, 1000);
  assert.equal(result.clicks, 25);
  assert.deepEqual(result.actions, [{ type: "link_click", value: 8 }]);
});

test("builds weighted totals and identifies campaigns without data", () => {
  const result = buildMetaOverview(
    [
      { id: "1", name: "A", status: "ACTIVE", effective_status: "ACTIVE" },
      { id: "2", name: "B", status: "PAUSED", effective_status: "PAUSED" },
    ],
    [
      {
        campaign_id: "1",
        spend: "10",
        impressions: "1000",
        reach: "800",
        clicks: "20",
      },
    ],
    null
  );

  assert.deepEqual(result.campaign_counts, {
    total: 2,
    active: 0,
    active_unverified: 1,
    completed: 0,
    paused: 1,
    scheduled: 0,
    not_delivering: 0,
    with_issues: 0,
    with_data: 1,
    without_data: 1,
    unmatched_insight_rows: 0,
  });
  assert.equal(result.totals.ctr_percent, 2);
  assert.equal(result.totals.cpc_eur, 0.5);
  assert.equal(result.totals.cpm_eur, 10);
  assert.equal(result.campaigns[1].data_status, "no_data");
  assert.equal(result.campaigns[1].metrics, null);
});

test("uses effective Meta status instead of configured status when present", () => {
  const result = buildMetaOverview(
    [
      {
        id: "1",
        status: "ACTIVE",
        effective_status: "WITH_ISSUES",
      },
    ],
    []
  );

  assert.equal(result.campaign_counts.active, 0);
  assert.equal(result.campaign_counts.active_unverified, 0);
  assert.equal(result.campaign_counts.paused, 0);
  assert.equal(result.campaign_counts.with_issues, 1);
});

test("classifies an enabled campaign with an expired ad set as completed", () => {
  const now = new Date("2026-08-20T12:00:00Z");
  const campaign = {
    id: "7",
    status: "ACTIVE",
    effective_status: "ACTIVE",
  };
  const adsets = [
    {
      campaign_id: "7",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      start_time: "2026-07-01T00:00:00Z",
      end_time: "2026-08-01T00:00:00Z",
    },
  ];

  assert.equal(classifyCampaignDelivery(campaign, adsets, now), "completed");

  const result = buildMetaOverview([campaign], [], adsets, now);
  assert.equal(result.campaign_counts.active, 0);
  assert.equal(result.campaign_counts.completed, 1);
  assert.equal(result.campaigns[0].delivery_status, "completed");
});

test("classifies a campaign as active only with a currently deliverable ad set", () => {
  const now = new Date("2026-08-20T12:00:00Z");
  const campaign = {
    id: "8",
    status: "ACTIVE",
    effective_status: "ACTIVE",
  };
  const adsets = [
    {
      campaign_id: "8",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      start_time: "2026-08-01T00:00:00Z",
      end_time: "2026-09-01T00:00:00Z",
    },
  ];

  assert.equal(classifyCampaignDelivery(campaign, adsets, now), "active");
});

test("does not call a campaign completed when only some ad sets have ended", () => {
  const now = new Date("2026-08-20T12:00:00Z");
  const campaign = {
    id: "9",
    status: "ACTIVE",
    effective_status: "ACTIVE",
  };
  const adsets = [
    {
      campaign_id: "9",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      end_time: "2026-08-01T00:00:00Z",
    },
    {
      campaign_id: "9",
      status: "PAUSED",
      effective_status: "PAUSED",
      end_time: null,
    },
  ];

  assert.equal(classifyCampaignDelivery(campaign, adsets, now), "not_delivering");
});

test("recognizes a configured paused campaign even with a derived Meta status", () => {
  assert.equal(
    classifyCampaignDelivery(
      {
        id: "10",
        status: "PAUSED",
        effective_status: "CAMPAIGN_PAUSED",
      },
      []
    ),
    "paused"
  );
});

test("does not claim Google API access from configuration alone", () => {
  const result = buildGoogleReadiness({
    GOOGLE_CLIENT_ID: "configured",
    GOOGLE_CLIENT_SECRET: "configured",
    GOOGLE_DEVELOPER_TOKEN: "configured",
    GOOGLE_REFRESH_TOKEN: "configured",
    GOOGLE_CUSTOMER_ID: "configured",
  });

  assert.equal(result.configuration_complete, true);
  assert.equal(result.api_access, "not_checked_by_report");
  assert.equal(result.reader_status, "configuration_ready_live_test_required");
});

test("reports incomplete Google configuration without exposing values", () => {
  const result = buildGoogleReadiness({ GOOGLE_CLIENT_ID: "configured" });

  assert.deepEqual(result, {
    configuration_complete: false,
    api_access: "not_checked_by_report",
    reader_status: "configuration_incomplete",
    next_step: "Complete the protected Google configuration",
  });
});
