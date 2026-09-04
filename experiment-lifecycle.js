const STATES = new Set(['proposed','approved','observing','stopped','completed','rolled_back']);

function toDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function learningFreshness({ concluded_at, now, ttl_days = 30 } = {}) {
  const concluded = toDate(concluded_at);
  const current = toDate(now || new Date().toISOString());
  const ttl = Number(ttl_days);
  if (!concluded || !current || !Number.isFinite(ttl) || ttl <= 0) return { fresh:false, age_days:null, reason:'invalid_or_missing_time_evidence' };
  const age = (current - concluded) / 86400000;
  if (age < 0) return { fresh:false, age_days:age, reason:'future_conclusion_timestamp' };
  return { fresh:age <= ttl, age_days:age, reason:age <= ttl ? 'within_ttl' : 'expired_learning' };
}

function evaluateExperimentLifecycle(input = {}) {
  const state = STATES.has(input.state) ? input.state : 'proposed';
  const observationStarted = toDate(input.observation_started_at);
  const observationEnds = toDate(input.observation_ends_at);
  const now = toDate(input.now || new Date().toISOString());
  const observationComplete = Boolean(observationStarted && observationEnds && now && now >= observationEnds);
  const evidenceMature = input.evidence_mature === true;
  const measurementVerified = input.measurement_verified === true;
  const rollbackDefined = Boolean(String(input.rollback || '').trim());
  const canJudgeOutcome = observationComplete && evidenceMature && measurementVerified;
  return {
    state,
    observation_complete: observationComplete,
    evidence_mature: evidenceMature,
    measurement_verified: measurementVerified,
    rollback_defined: rollbackDefined,
    outcome_judgment_allowed: canJudgeOutcome,
    continue_observation: state === 'observing' && !canJudgeOutcome,
    stop_supported: input.stop_condition_met === true,
    rollback_ready: input.stop_condition_met === true && rollbackDefined,
    conclusion_must_expire: true,
    execution_authorized: false,
    writes_allowed: false,
  };
}

module.exports = { learningFreshness, evaluateExperimentLifecycle };
