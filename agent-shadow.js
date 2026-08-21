const { buildDecisionSupportReport } = require("./decision-support");
const { assessConversionIntegrity, detectAnomalies, createDecisionJournalEntry } = require("./agent-foundation");
const { analyzeSearchTerms, rankCreatives, proposeCreativeTests } = require("./acquisition-intelligence");
const { recommendBudget, assessFunnel, buildDailyManager } = require("./optimization-manager");
const { classifyAction } = require("./safety-experiments");
const { estimateBusinessValue, allocateChannelRoles, scheduleChecks } = require("./business-ops-evaluation");

function buildShadowAgentReport(input = {}) {
  const meta = input.meta || {};
  const google = input.google || {};
  const conversions = input.conversions || {};
  const conversionIntegrity = assessConversionIntegrity({
    googleAdsConversions: conversions.google_ads_conversions ?? null,
    ga4Bookings: conversions.booking_completed ?? null,
    googleLastSeenAt: conversions.google_last_seen_at || null,
    ga4LastSeenAt: conversions.ga4_last_seen_at || null,
    now: input.now ? new Date(input.now) : new Date(),
  });

  const legacyDecisionSupport = buildDecisionSupportReport({ meta, google, conversions });
  const anomalies = detectAnomalies({
    current: input.current || {},
    baseline: input.baseline || {},
    access: input.access || {},
  });
  const searchRecommendations = analyzeSearchTerms(input.search_terms || []);
  const rankedCreatives = rankCreatives(input.creatives || []);
  const creativeTests = proposeCreativeTests(rankedCreatives);
  const funnel = assessFunnel({
    ...(input.funnel || {}),
    conversionIntegrity: conversionIntegrity.status,
  });

  const budget = conversionIntegrity.optimization_allowed
    ? recommendBudget(input.budget_inputs || [])
    : (input.budget_inputs || []).map((row) => ({
        channel: row.channel || "unknown",
        campaign: row.campaign || null,
        recommendation: "keep",
        proposed_delta_percent: 0,
        confidence: "low",
        reason: "Budget optimization blocked because conversion integrity is not healthy.",
        requires_authorization: false,
      }));

  const recommendations = [
    ...(legacyDecisionSupport.recommendations || []),
    ...searchRecommendations,
    ...creativeTests.map((item) => ({
      ...item,
      code: "CREATIVE_TEST_PROPOSAL",
      priority: "medium",
      score: 50,
      reason: item.reason,
    })),
  ];

  const dailyManager = buildDailyManager({
    recommendations,
    anomalies,
    funnel,
    budget,
  });

  const channelRoles = allocateChannelRoles(input.channel_signals || {});
  const businessValue = estimateBusinessValue(input.business_value || {});
  const schedule = scheduleChecks({
    now: input.now ? new Date(input.now) : new Date(),
    lastRuns: input.last_runs || {},
  });

  const actions = dailyManager.primary_priorities.map((priority) => {
    const requestedAction = priority.requires_authorization ? "analyze" : "analyze";
    return {
      code: priority.code,
      safety: classifyAction({ type: requestedAction }),
    };
  });

  const journal = createDecisionJournalEntry({
    channel: "cross_channel",
    evidenceWindow: input.evidence_window || null,
    evidence: {
      conversion_integrity: conversionIntegrity,
      anomaly_count: anomalies.length,
      priority_count: dailyManager.primary_priorities.length,
    },
    dataQuality: conversionIntegrity.status,
    diagnosis: dailyManager.primary_priorities[0]?.reason || "No material priority detected.",
    confidence: conversionIntegrity.confidence,
    expectedEffect: "Shadow-mode diagnosis only; no external state mutation.",
    proposedAction: "review_shadow_report",
    requiresAuthorization: false,
  });

  return {
    mode: "shadow",
    writes_allowed: false,
    conversion_integrity: conversionIntegrity,
    anomalies,
    search_term_recommendations: searchRecommendations,
    creative_ranking: rankedCreatives,
    creative_test_proposals: creativeTests,
    funnel,
    budget_recommendations: budget,
    daily_manager: dailyManager,
    channel_roles: channelRoles,
    business_value: businessValue,
    schedule,
    safety_preview: actions,
    legacy_decision_support: legacyDecisionSupport,
    journal,
  };
}

module.exports = { buildShadowAgentReport };
