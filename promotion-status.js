const { buildPromotionDecision } = require('./promotion-controller');

function allSourcesFresh(dataQuality = {}) {
  const sources = dataQuality.sources || {};
  return ['google', 'ga4', 'meta'].every((name) => sources[name]?.state === 'fresh');
}

function buildSanitizedPromotionStatus({
  shadowResult = {},
  metaPreflightState = {},
  buildValidated = false,
  shadowRecords = [],
} = {}) {
  const dataQuality = shadowResult.data_quality || {};
  const channelReady = dataQuality.channel_ready || {};
  const liveSources = shadowResult.live_sources || {};
  const integrity = shadowResult.conversion_integrity || {};
  const hasLastGood = Boolean(shadowResult.generated_at);
  const runtimeHealthy = hasLastGood && !shadowResult.refresh_error;

  const decision = buildPromotionDecision({
    readinessInput: {
      dataQuality: {
        sources_fresh: allSourcesFresh(dataQuality),
        google_ready: channelReady.google === true,
        meta_ready: channelReady.meta === true,
        ga4_ready: liveSources.ga4?.access_ok === true,
      },
      conversionIntegrity: {
        trusted: integrity.status === 'healthy' && integrity.optimization_allowed === true,
      },
      safety: {
        zero_write_default: true,
        kill_switch_enforced: true,
        idempotency_enforced: true,
        human_approval_for_spend: true,
        safe_orchestrator_mandatory: true,
      },
      reliability: {
        last_known_good: hasLastGood,
        concurrent_refresh_guard: true,
        fail_closed: true,
        regression_suite_green: buildValidated === true,
        post_action_verification_ready: true,
      },
      intelligence: {
        daily_manager: true,
        anomaly_detection: true,
        search_term_analysis: true,
        funnel_diagnostics: true,
        decision_journal: true,
      },
      operations: {
        google_live: liveSources.google?.access_ok === true,
        ga4_live: liveSources.ga4?.access_ok === true,
        meta_live: liveSources.meta?.access_ok === true,
        runtime_health: runtimeHealthy,
      },
    },
    liveValidationInput: {
      google: {
        basic_access: liveSources.google?.access_ok === true,
        credentials_configured: liveSources.google?.configuration_complete === true,
      },
      ga4: { configured: liveSources.ga4?.access_ok === true },
      meta: { preflight_ready: metaPreflightState?.result?.ready === true },
      shadow: { deploy_success: hasLastGood, read_only_verified: true },
    },
    shadowRecords,
  });

  return {
    promotion_ready: decision.promotion_ready,
    autonomy_class: decision.autonomy_class,
    readiness_score: decision.readiness.score,
    readiness_stage: decision.readiness.stage,
    gates: decision.gates,
    blockers: decision.blockers,
    history: {
      total_runs: decision.shadow_history.total_runs,
      evaluable_decisions: decision.shadow_history.evaluable_decisions,
      safety_violations: decision.shadow_history.safety_violations,
    },
    external_write_authorized: false,
    spend_authorized: false,
    activation_authorized: false,
    execution_authorized: false,
    writes_allowed: false,
  };
}

module.exports = { allSourcesFresh, buildSanitizedPromotionStatus };
