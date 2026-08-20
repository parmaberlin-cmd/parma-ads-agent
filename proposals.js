function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildMetaDinnerProposal({
  metaOverview,
  dailyBudgetEur = 6,
  durationDays = 14,
  goal = "dinner_visits",
  generatedAt = new Date(),
}) {
  const totalBudgetEur = roundMoney(dailyBudgetEur * durationDays);
  const counts = metaOverview.campaign_counts;
  const hasRecentData = counts.with_data > 0;

  const objective =
    goal === "reservations" ? "OUTCOME_TRAFFIC" : "OUTCOME_AWARENESS";
  const optimization =
    goal === "reservations" ? "LANDING_PAGE_VIEWS" : "REACH";

  return {
    success: true,
    proposal: {
      id: `meta-dinner-${generatedAt.toISOString().slice(0, 10)}`,
      status: "draft_requires_human_approval",
      title: "Parma Berlin — controlled dinner customer experiment",
      business_goal:
        goal === "reservations"
          ? "Generate qualified visits to the approved reservation destination."
          : "Increase local awareness and dinner visits near Wrangelstraße 90.",
      evidence: {
        period: "last_30d",
        campaigns_total: counts.total,
        campaigns_active: counts.active,
        campaigns_completed: counts.completed,
        campaigns_paused: counts.paused,
        campaigns_with_issues: counts.with_issues,
        campaigns_with_data: counts.with_data,
        spend_eur: metaOverview.totals.spend_eur,
        conclusion:
          counts.active === 0
            ? "No Meta campaign is currently delivering."
            : "At least one Meta campaign is currently delivering.",
        data_limit:
          hasRecentData
            ? "Recent Meta delivery data is available for comparison."
            : "No recent Meta delivery baseline is available; do not invent forecasts or ROI.",
      },
      recommendation: {
        decision:
          "Prepare one small local dinner campaign instead of reusing recruiting or obsolete campaigns.",
        rationale: [
          "A single campaign avoids fragmenting a small test budget.",
          "Local targeting keeps the experiment relevant to people near the restaurant.",
          "A capped test creates real performance data before any scale decision.",
        ],
      },
      campaign_draft: {
        name: "Parma | Dinner | Kreuzberg | Controlled test",
        objective,
        buying_type: "AUCTION",
        configured_status: "PAUSED_DRAFT",
        daily_budget_eur: dailyBudgetEur,
        duration_days: durationDays,
        maximum_total_budget_eur: totalBudgetEur,
      },
      ad_set_draft: {
        location: "Wrangelstraße 90, Berlin",
        radius_km: 3,
        age_range: "23–60",
        genders: "all",
        detailed_targeting: "broad local audience; no sensitive targeting",
        optimization_goal: optimization,
        placements: [
          "Instagram Reels",
          "Instagram Stories",
          "Instagram Feed",
          "Facebook Feed",
          "Facebook Reels",
        ],
        delivery_window_local:
          "Dinner hours only after opening days and exact hours are confirmed",
      },
      creative_drafts: [
        {
          language: "de",
          format: "vertical video or authentic restaurant photo",
          primary_text:
            "Sauerteigpizza, Bio-Zutaten und echtes Handwerk in Kreuzberg. Heute Abend bei Parma in der Wrangelstraße 90.",
          headline: "Pizzaabend in Kreuzberg",
          call_to_action:
            goal === "reservations" ? "Reservieren" : "Route planen",
        },
        {
          language: "en",
          format: "vertical video or authentic restaurant photo",
          primary_text:
            "Sourdough pizza, organic ingredients and honest craft in Kreuzberg. Dinner tonight at Parma, Wrangelstraße 90.",
          headline: "Pizza night in Kreuzberg",
          call_to_action:
            goal === "reservations" ? "Book now" : "Get directions",
        },
      ],
      measurement_plan: {
        reporting_after_days: [3, 7, durationDays],
        metrics: [
          "spend",
          "reach",
          "impressions",
          "frequency",
          goal === "reservations" ? "landing_page_views" : "link_clicks",
          "cost_per_result",
        ],
        decision_rule:
          "Do not increase budget until real delivery data and the restaurant's business result are reviewed together.",
      },
      approval_checklist: [
        "Confirm the campaign goal: dinner visits or reservations",
        "Confirm opening days and exact advertising hours",
        "Confirm the destination: directions, website, menu or reservation page",
        "Approve daily budget, duration and maximum total budget",
        "Approve the final photos or videos and both ad texts",
        "Confirm that no discount or offer should be added unless explicitly approved",
      ],
      safety: {
        read_only: true,
        creates_campaign: false,
        publishes_ads: false,
        activates_spend: false,
        human_approval_required: true,
        recruiting_campaigns_excluded: true,
      },
    },
  };
}

module.exports = { buildMetaDinnerProposal };
