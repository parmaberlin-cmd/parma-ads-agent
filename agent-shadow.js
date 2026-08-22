const { buildDecisionSupportReport } = require("./decision-support");
const { assessConversionIntegrity, detectAnomalies, createDecisionJournalEntry } = require("./agent-foundation");
const { analyzeSearchTerms, rankCreatives, proposeCreativeTests } = require("./acquisition-intelligence");
const { recommendBudget, assessFunnel, buildDailyManager } = require("./optimization-manager");
const { classifyAction } = require("./safety-experiments");
const { estimateBusinessValue, allocateChannelRoles, scheduleChecks } = require("./business-ops-evaluation");

function ga4EventCount(events, name) { return Number(events?.[name]?.event_count || 0); }
function deriveLiveFunnel(input = {}) {
  if (input.funnel && Object.keys(input.funnel).length) return input.funnel;
  const events = input.ga4_funnel?.reservation_funnel?.google_cpc;
  if (!events) return {};
  return {
    landingAvailable: true,
    adClicks: Number(input.google?.totals?.clicks || input.current?.clicks || 0),
    landingViews: ga4EventCount(events, "page_view"),
    reservationStarts: ga4EventCount(events, "booking_started"),
    bookings: ga4EventCount(events, "booking_completed"),
  };
}

function buildShadowAgentReport(input = {}) {
  const meta=input.meta||{}, google=input.google||{}, conversions=input.conversions||{};
  const conversionIntegrity=assessConversionIntegrity({googleAdsConversions:conversions.google_ads_conversions??null,ga4Bookings:conversions.booking_completed??null,googleLastSeenAt:conversions.google_last_seen_at||null,ga4LastSeenAt:conversions.ga4_last_seen_at||null,now:input.now?new Date(input.now):new Date()});
  const legacyDecisionSupport=buildDecisionSupportReport({meta,google,conversions});
  const anomalies=detectAnomalies({current:input.current||{},baseline:input.baseline||{},access:input.access||{}});
  const liveSearchTerms=input.search_terms || google.search_terms || input.live_sources?.google?.search_terms || [];
  const searchRecommendations=analyzeSearchTerms(liveSearchTerms);
  const rankedCreatives=rankCreatives(input.creatives||[]), creativeTests=proposeCreativeTests(rankedCreatives);
  const funnel=assessFunnel({...deriveLiveFunnel(input),conversionIntegrity:conversionIntegrity.status});
  const budget=conversionIntegrity.optimization_allowed?recommendBudget(input.budget_inputs||[]):(input.budget_inputs||[]).map(row=>({channel:row.channel||"unknown",campaign:row.campaign||null,recommendation:"keep",proposed_delta_percent:0,confidence:"low",reason:"Budget optimization blocked because conversion integrity is not healthy.",requires_authorization:false}));
  const recommendations=[...(legacyDecisionSupport.recommendations||[]),...searchRecommendations,...creativeTests.map(item=>({...item,code:"CREATIVE_TEST_PROPOSAL",priority:"medium",score:50,reason:item.reason}))];
  const dailyManager=buildDailyManager({recommendations,anomalies,funnel,budget});
  const channelRoles=allocateChannelRoles(input.channel_signals||{}), businessValue=estimateBusinessValue(input.business_value||{}), schedule=scheduleChecks({now:input.now?new Date(input.now):new Date(),lastRuns:input.last_runs||{}});
  const actions=dailyManager.primary_priorities.map(priority=>({code:priority.code,safety:classifyAction({type:"analyze"})}));
  const journal=createDecisionJournalEntry({channel:"cross_channel",evidenceWindow:input.evidence_window||null,evidence:{conversion_integrity:conversionIntegrity,anomaly_count:anomalies.length,priority_count:dailyManager.primary_priorities.length,search_terms_analyzed:liveSearchTerms.length,funnel_source:input.funnel?"explicit":input.ga4_funnel?.reservation_funnel?.google_cpc?"ga4_google_cpc":"unavailable"},dataQuality:conversionIntegrity.status,diagnosis:dailyManager.primary_priorities[0]?.reason||"No material priority detected.",confidence:conversionIntegrity.confidence,expectedEffect:"Shadow-mode diagnosis only; no external state mutation.",proposedAction:"review_shadow_report",requiresAuthorization:false});
  return {mode:"shadow",writes_allowed:false,conversion_integrity:conversionIntegrity,anomalies,search_term_recommendations:searchRecommendations,creative_ranking:rankedCreatives,creative_test_proposals:creativeTests,funnel,budget_recommendations:budget,daily_manager:dailyManager,channel_roles:channelRoles,business_value:businessValue,schedule,safety_preview:actions,legacy_decision_support:legacyDecisionSupport,journal};
}
module.exports={buildShadowAgentReport,deriveLiveFunnel};
