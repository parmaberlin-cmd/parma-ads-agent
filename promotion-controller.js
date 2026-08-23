const { assessAgentReadiness, assertReadinessIsInformational } = require("./agent-readiness");
const { assessLiveValidationReadiness } = require("./live-validation-readiness");
const {
  summarizeShadowHistory,
  promotionAssessment,
  allowedAutonomyClass,
} = require("./shadow-evaluation");

function buildPromotionDecision({
  readinessInput = {},
  liveValidationInput = {},
  shadowRecords = [],
  shadowPolicy = {},
} = {}) {
  const readiness = assessAgentReadiness(readinessInput);
  assertReadinessIsInformational(readiness);

  const liveValidation = assessLiveValidationReadiness(liveValidationInput);
  const shadowHistory = summarizeShadowHistory(shadowRecords);
  const shadowPromotion = promotionAssessment(shadowHistory, shadowPolicy);

  const gates = {
    readiness: readiness.supervised_write_candidate === true,
    live_validation: liveValidation.full_shadow_live_ready === true,
    shadow_history: shadowPromotion.candidate_for_supervised_low_risk === true,
  };

  const blockers = [];
  if (!gates.readiness) {
    blockers.push(...(readiness.hard_blockers || []).map((code) => `readiness:${code}`));
    if (!(readiness.hard_blockers || []).length) blockers.push("readiness:score_or_stage_not_ready");
  }
  if (!gates.live_validation) {
    blockers.push(...(liveValidation.blockers || []).map((code) => `live:${code}`));
    if (!(liveValidation.blockers || []).length) blockers.push("live:full_shadow_not_ready");
  }
  if (!gates.shadow_history) {
    blockers.push(...(shadowPromotion.blockers || []).map((code) => `history:${code}`));
    if (!(shadowPromotion.blockers || []).length) blockers.push("history:promotion_not_ready");
  }

  const promotionReady = Object.values(gates).every(Boolean);
  const autonomyClass = promotionReady
    ? allowedAutonomyClass(shadowPromotion)
    : "observe_and_propose";

  const decision = {
    promotion_ready: promotionReady,
    autonomy_class: autonomyClass,
    gates,
    blockers: [...new Set(blockers)],
    readiness: {
      score: readiness.score,
      stage: readiness.stage,
      dimensions: readiness.dimensions,
    },
    live_validation: {
      full_shadow_live_ready: liveValidation.full_shadow_live_ready,
      google_live_ready: liveValidation.google_live_ready,
      ga4_live_ready: liveValidation.ga4_live_ready,
      meta_paused_test_ready: liveValidation.meta_paused_test_ready,
    },
    shadow_history: {
      total_runs: shadowHistory.total_runs,
      evaluable_decisions: shadowHistory.evaluable_decisions,
      precision: shadowHistory.precision,
      false_positive_rate: shadowHistory.false_positive_rate,
      safety_violations: shadowHistory.safety_violations,
    },
    internal_reversible_candidate: promotionReady,
    external_write_authorized: false,
    spend_authorized: false,
    campaign_creation_authorized: false,
    activation_authorized: false,
    execution_authorized: false,
    writes_allowed: false,
  };

  assertPromotionFailClosed(decision);
  return decision;
}

function assertPromotionFailClosed(decision) {
  const forbidden = [
    "external_write_authorized",
    "spend_authorized",
    "campaign_creation_authorized",
    "activation_authorized",
    "execution_authorized",
    "writes_allowed",
  ];
  for (const field of forbidden) {
    if (decision?.[field] !== false) {
      throw new Error(`promotion controller violated fail-closed contract: ${field}`);
    }
  }
  if (decision?.promotion_ready !== true && decision?.autonomy_class !== "observe_and_propose") {
    throw new Error("non-promoted state must remain observe_and_propose");
  }
  return true;
}

module.exports = {
  buildPromotionDecision,
  assertPromotionFailClosed,
};
