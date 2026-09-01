const FUNNELS = Object.freeze({
  reservation: ['ad_click','landing_session','reservation_start','reservation_completed'],
  direct_order: ['ad_click','landing_session','order_cta','checkout_start','direct_order_completed'],
});

function normalizeCount(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function assessCustomerFunnel(type, evidence = {}) {
  const steps = FUNNELS[type];
  if (!steps) return { type:'unknown', status:'invalid_funnel', optimization_allowed:false, writes_allowed:false };
  const normalized = Object.fromEntries(steps.map((step) => [step, normalizeCount(evidence[step])]));
  const missing = steps.filter((step) => normalized[step] == null);
  const impossible = [];
  for (let i=1;i<steps.length;i++) {
    const prev = normalized[steps[i-1]], current = normalized[steps[i]];
    if (prev != null && current != null && current > prev) impossible.push(`${steps[i]}_exceeds_${steps[i-1]}`);
  }
  const completion = normalized[steps[steps.length-1]];
  const start = normalized[steps[0]];
  const completionRate = start > 0 && completion != null ? completion / start : null;
  const verified = missing.length === 0 && impossible.length === 0 && evidence.completion_semantics_verified === true && evidence.dedupe_verified === true;
  return {
    type,
    steps: normalized,
    missing_steps: missing,
    impossible_relationships: impossible,
    completion_rate: completionRate,
    status: verified ? 'verified_funnel' : 'incomplete_or_unverified',
    leakage_claim_supported: missing.length === 0 && impossible.length === 0,
    optimization_allowed: verified,
    execution_authorized:false,
    writes_allowed:false,
  };
}

module.exports = { FUNNELS, assessCustomerFunnel };
