function parseDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function evidenceFreshness({ observed_at, now = new Date().toISOString(), max_age_hours = 48 } = {}) {
  const observed = parseDate(observed_at);
  const current = parseDate(now);
  if (!observed || !current || max_age_hours <= 0) return { fresh:false, status:'unknown', age_hours:null };
  const age = (current - observed) / 3600000;
  return { fresh: age >= 0 && age <= max_age_hours, status: age >= 0 && age <= max_age_hours ? 'fresh' : 'stale', age_hours:Number(age.toFixed(2)) };
}

function recommendationState({ created_at, now, ttl_hours = 168, evidence_fresh = false, measurement_verified = false } = {}) {
  const life = evidenceFreshness({ observed_at:created_at, now, max_age_hours:ttl_hours });
  const valid = life.fresh && evidence_fresh && measurement_verified;
  return {
    valid,
    expired: !life.fresh,
    evidence_fresh:Boolean(evidence_fresh),
    measurement_verified:Boolean(measurement_verified),
    execution_authorized:false,
    reason: valid ? 'current_evidence_supports_recommendation' : 'refresh_or_verification_required'
  };
}

function maturityState({ window_end, now = new Date().toISOString(), minimum_lag_hours = 72 } = {}) {
  const end = parseDate(window_end);
  const current = parseDate(now);
  if (!end || !current) return { mature:false, lag_hours:null, status:'unknown' };
  const lag = (current - end) / 3600000;
  return { mature: lag >= minimum_lag_hours, lag_hours:Number(lag.toFixed(2)), status:lag >= minimum_lag_hours ? 'mature' : 'immature' };
}

module.exports = { evidenceFreshness, recommendationState, maturityState };
