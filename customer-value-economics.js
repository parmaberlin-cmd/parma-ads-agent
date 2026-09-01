function finiteNonNegative(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function breakEvenCpa(input = {}) {
  const contribution = finiteNonNegative(input.contribution_per_incremental_customer);
  const safety = finiteNonNegative(input.safety_factor);
  if (contribution == null) return { break_even_cpa:null, reason:'contribution_missing' };
  const factor = safety == null ? 1 : Math.min(1, safety);
  return { break_even_cpa:Number((contribution * factor).toFixed(2)), reason:null, safety_factor:factor };
}

function simplifiedLtv(input = {}) {
  const contribution = finiteNonNegative(input.contribution_per_order);
  const orders = finiteNonNegative(input.expected_verified_orders_per_customer);
  const retentionCost = finiteNonNegative(input.incremental_retention_cost_per_customer);
  if (contribution == null || orders == null || retentionCost == null) return { ltv:null, reason:'explicit_ltv_inputs_missing' };
  return { ltv:Number((contribution * orders - retentionCost).toFixed(2)), reason:null, model:'simplified_explicit_input' };
}

function customerValueEconomics(input = {}) {
  const cpa = breakEvenCpa(input);
  const ltv = simplifiedLtv(input);
  return {
    break_even_cpa:cpa.break_even_cpa,
    simplified_ltv:ltv.ltv,
    complete:cpa.break_even_cpa != null && ltv.ltv != null,
    recommendation_permission:false,
    spend_authorized:false,
    writes_allowed:false,
    unknowns:[cpa.reason, ltv.reason].filter(Boolean),
  };
}

module.exports = { breakEvenCpa, simplifiedLtv, customerValueEconomics };
