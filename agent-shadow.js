const { buildDecisionSupportReport } = require("./decision-support");
const { assessConversionIntegrity, detectAnomalies, createDecisionJournalEntry } = require("./agent-foundation");
const { analyzeSearchTerms, rankCreatives, proposeCreativeTests } = require("./acquisition-intelligence");
const { recommendBudget, assessFunnel, buildDailyManager } = require("./optimization-manager");
const { classifyAction } = require("./safety-experiments");
const { estimateBusinessValue, allocateChannelRoles, scheduleChecks } = require("./business-ops-evaluation");
const { detectWaste, detectOpportunities, assessMatchTypes, simulateBudget, assessLandingContinuity, assessRsa, buildSafetyGate, buildExecutiveModel } = require("./preaccess-intelligence");
const { detectTrendAnomalies, detectTrackingAnomaly } = require("./trend-intelligence");
const { buildDailyDecisionBrief } = require('./daily-decision-brief');

function buildShadowAgentReport(input = {}) {
  const meta = input.meta || {};
  const google = input.google || {};
  const conversions = input.conversions || {};
  const conversionIntegrity = assessConversionIntegrity({
    googleAdsConversions: conversions.google_ads_conversions ?? null,
    ga4Bookings: conversions.booking_completed ?? null,
    googleLastSeenAt: conversions.google_last_seen_at || null,
    ga4LastSeenAt: conversions.ga4_last_seen_at || null,
    googleCollectedAt: conversions.google_collected_at || null,
    ga4CollectedAt: conversions.ga4_collected_at || null,
    now: input.now ? new Date(input.now) : new Date(),
    reconciliationEvidence: input.conversion_evidence || {},
  });
  const trustedConversions = conversionIntegrity.optimization_allowed === true;

  const legacyDecisionSupport = buildDecisionSupportReport({ meta, google, conversions });
  // This legacy rule mixes Meta clicks with a GA4 google/cpc-session signal.
  // Preserve access/delivery diagnostics, never publish that cross-population claim.
  legacyDecisionSupport.recommendations = legacyDecisionSupport.recommendations.filter((item) => item.code !== 'CLICKS_WITHOUT_BOOKINGS');
  const remainingLegacy = legacyDecisionSupport.recommendations;
  legacyDecisionSupport.recommendation_counts = {
    total: remainingLegacy.length,
    critical: remainingLegacy.filter(x => x.priority === 'critical').length,
    high: remainingLegacy.filter(x => x.priority === 'high').length,
    medium: remainingLegacy.filter(x => x.priority === 'medium').length,
    authorization_required: remainingLegacy.filter(x => x.requires_authorization).length,
  };
  legacyDecisionSupport.decision_status = legacyDecisionSupport.recommendation_counts.critical ? 'blocked' : legacyDecisionSupport.recommendation_counts.high ? 'attention_required' : 'monitor';
  const baseAnomalies = detectAnomalies({ current: input.current || {}, baseline: input.baseline || {}, access: input.access || {} });
  const trendAnalysis = detectTrendAnomalies({ current: input.current || {}, baseline: input.baseline || {} });
  const trackingAnomalies = detectTrackingAnomaly({
    googleConversions: conversions.google_ads_conversions,
    ga4Bookings: conversions.booking_completed,
    googleLastSeenAt: conversions.google_last_seen_at,
    ga4LastSeenAt: conversions.ga4_last_seen_at,
    googleCollectedAt: conversions.google_collected_at,
    ga4CollectedAt: conversions.ga4_collected_at,
    now: input.now ? new Date(input.now) : new Date(),
  });
  const anomalies = [
    ...baseAnomalies,
    ...trendAnalysis.anomalies.map((item) => ({ ...item, reason: item.code })),
    ...trackingAnomalies.map((item) => ({ ...item, reason: item.code })),
  ].filter((item) => trustedConversions || !['CONVERSION_COLLAPSE', 'CONVERSION_DROP', 'SPEND_SPIKE_WITHOUT_CONVERSION_GAIN', 'ADS_GA4_TRACKING_DIVERGENCE'].includes(item.code));

  const searchRecommendations = analyzeSearchTerms(input.search_terms || [], { knownKeywords: input.keywords || [] })
    .filter((item) => trustedConversions || item.type === 'broad_match_attention');
  const rankedCreatives = input.creative_measurement_verified === true ? rankCreatives(input.creatives || []) : [];
  const creativeTests = proposeCreativeTests(rankedCreatives);
  const funnel = assessFunnel({ ...(input.funnel || {}), conversionIntegrity: conversionIntegrity.status });
  const waste = trustedConversions ? detectWaste({ searchTerms: input.search_terms || [], keywords: input.keywords || [] }) : { items: [], estimated_waste_eur: null, status: 'measurement_unverified' };
  const opportunities = trustedConversions ? detectOpportunities({ searchTerms: input.search_terms || [], keywords: input.keywords || [] }) : [];
  const matchTypeAnalysis = assessMatchTypes(input.search_terms || []);
  if (!trustedConversions) matchTypeAnalysis.warnings = [];
  const rsaAnalysis = (input.rsa_assets || []).map((asset) => ({ campaign: asset.campaign || null, ad_group: asset.ad_group || null, ...assessRsa(asset) }));
  const landingContinuity = (input.landing_contexts || []).map((row) => ({ id: row.id || null, ...assessLandingContinuity(row) }));
  const safetyGate = buildSafetyGate({
    conversionIntegrity,
    ga4Ok: input.access?.ga4_ok === true,
    googleOk: input.access?.google_ok === true,
    funnelStatus: funnel.status,
    evidenceCount: (input.search_terms || []).length + (input.keywords || []).length,
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
  const budgetSimulation = trustedConversions ? simulateBudget(input.budget_inputs || []) : [];

  const intelligenceRecommendations = [
    ...waste.items.map((item) => ({ code: item.source === "search_term" ? "SEARCH_TERM_WASTE_REVIEW" : "KEYWORD_WASTE_REVIEW", priority: "medium", score: Math.min(80, 45 + Math.round(item.estimated_waste_eur)), reason: item.reason, requires_authorization: true })),
    ...opportunities.map((item) => ({ code: item.type === "keyword_expansion" ? "KEYWORD_EXPANSION_OPPORTUNITY" : "PROVEN_KEYWORD_PROTECTION", priority: item.confidence === "high" ? "high" : "medium", score: item.confidence === "high" ? 75 : 55, reason: "Opportunity supported by conversion evidence.", requires_authorization: Boolean(item.requires_authorization) })),
    ...matchTypeAnalysis.warnings.map((item) => ({ code: item.code, priority: item.severity || "medium", score: 60, reason: item.reason, requires_authorization: false })),
    ...rsaAnalysis.filter((item) => item.status !== "healthy").map(() => ({ code:"RSA_ATTENTION_REQUIRED", priority:"medium", score:55, reason:"RSA asset variety or intent coverage requires review.", requires_authorization:true })),
    ...landingContinuity.filter((item) => item.status === "weak").map(() => ({ code:"LANDING_CONTINUITY_WEAK", priority:"medium", score:58, reason:"Search intent, ad copy and landing content have weak continuity.", requires_authorization:false })),
  ];

  const recommendations = [
    ...(legacyDecisionSupport.recommendations || []),
    ...searchRecommendations,
    ...intelligenceRecommendations,
    ...creativeTests.map((item) => ({ ...item, code: "CREATIVE_TEST_PROPOSAL", priority: "medium", score: 50, reason: item.reason })),
  ];

  const dailyManager = buildDailyManager({ recommendations, anomalies, funnel, budget });
  const channelRoles = allocateChannelRoles(input.channel_signals || {});
  const businessValue = trustedConversions && input.business_value_verified === true
    ? { ...estimateBusinessValue(input.business_value || {}), status: 'input_based_estimate' }
    : { status: 'measurement_unverified', spend_eur: null, bookings: null, estimated_revenue_eur: null, estimated_roas: null, estimated_contribution_after_ads_eur: null };
  const schedule = scheduleChecks({ now: input.now ? new Date(input.now) : new Date(), lastRuns: input.last_runs || {} });
  const actions = dailyManager.primary_priorities.map((priority) => ({ code: priority.code, safety: classifyAction({ type: "analyze" }) }));
  const executive = buildExecutiveModel({ waste, opportunities, funnel, conversionIntegrity, safetyGate });
  if (!trustedConversions) executive.estimated_waste_eur = null;

  const journal = createDecisionJournalEntry({
    channel: "cross_channel",
    evidenceWindow: input.evidence_window || null,
    evidence: {
      conversion_integrity: conversionIntegrity,
      anomaly_count: anomalies.length,
      priority_count: dailyManager.primary_priorities.length,
      estimated_waste_eur: waste.estimated_waste_eur,
      opportunity_count: opportunities.length,
    },
    dataQuality: conversionIntegrity.status,
    diagnosis: dailyManager.primary_priorities[0]?.reason || "No material priority detected.",
    confidence: conversionIntegrity.confidence,
    expectedEffect: "Shadow-mode diagnosis only; no external state mutation.",
    proposedAction: "review_shadow_report",
    requiresAuthorization: false,
  });

  const decisionBrief = buildDailyDecisionBrief({ input, report: { conversion_integrity: conversionIntegrity, funnel }, now: input.now ? new Date(input.now) : new Date() });

  return {
    mode: "shadow",
    writes_allowed: false,
    conversion_integrity: conversionIntegrity,
    anomalies,
    trend_analysis: trendAnalysis,
    search_term_recommendations: searchRecommendations,
    waste,
    opportunities,
    match_type_analysis: matchTypeAnalysis,
    rsa_analysis: rsaAnalysis,
    landing_continuity: landingContinuity,
    budget_simulation: budgetSimulation,
    safety_gate: safetyGate,
    executive,
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
    decision_brief: decisionBrief,
    withheld_analysis: {
      conversion_dependent: !trustedConversions,
      creative_outcome_ranking: input.creative_measurement_verified !== true,
      reason: 'Descriptive source and intent diagnostics remain available; unverified outcomes are not optimization evidence.',
    },
  };
}

module.exports = { buildShadowAgentReport };
