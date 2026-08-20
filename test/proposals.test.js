const test = require("node:test");
const assert = require("node:assert/strict");

const { buildMetaDinnerProposal } = require("../proposals");

function metaOverview(overrides = {}) {
  return {
    campaign_counts: {
      total: 7,
      active: 0,
      completed: 1,
      paused: 1,
      with_issues: 5,
      with_data: 0,
      ...overrides,
    },
    totals: { spend_eur: 0 },
  };
}

test("builds a capped read-only dinner proposal from real Meta state", () => {
  const result = buildMetaDinnerProposal({
    metaOverview: metaOverview(),
    dailyBudgetEur: 6,
    durationDays: 14,
    generatedAt: new Date("2026-08-20T12:00:00Z"),
  });

  assert.equal(result.proposal.status, "draft_requires_human_approval");
  assert.equal(result.proposal.evidence.campaigns_active, 0);
  assert.equal(result.proposal.campaign_draft.maximum_total_budget_eur, 84);
  assert.equal(result.proposal.campaign_draft.objective, "OUTCOME_AWARENESS");
  assert.equal(result.proposal.safety.creates_campaign, false);
  assert.equal(result.proposal.safety.activates_spend, false);
  assert.match(result.proposal.evidence.data_limit, /do not invent/i);
});

test("uses a traffic objective only for an approved reservation goal", () => {
  const result = buildMetaDinnerProposal({
    metaOverview: metaOverview({ with_data: 1 }),
    dailyBudgetEur: 5,
    durationDays: 10,
    goal: "reservations",
  });

  assert.equal(result.proposal.campaign_draft.objective, "OUTCOME_TRAFFIC");
  assert.equal(
    result.proposal.ad_set_draft.optimization_goal,
    "LANDING_PAGE_VIEWS"
  );
  assert.equal(result.proposal.campaign_draft.maximum_total_budget_eur, 50);
});
