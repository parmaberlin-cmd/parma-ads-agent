function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function contributionValue(input = {}) {
  const revenue = finiteOrNull(input.revenue);
  if (revenue === null) return { value: null, confidence: "unknown", reason: "revenue_missing" };
  const costs = ["food_cost", "payment_fee", "marketplace_commission", "packaging_cost", "incremental_labor"];
  let knownCosts = 0;
  const unknownCosts = [];
  for (const key of costs) {
    const value = finiteOrNull(input[key]);
    if (value === null) unknownCosts.push(key);
    else knownCosts += value;
  }
  if (unknownCosts.length) return { value: null, confidence: "unknown", reason: "cost_inputs_missing", unknown_costs: unknownCosts };
  return { value: Number((revenue - knownCosts).toFixed(2)), confidence: "input_based", reason: null };
}

function rankOutcomes(outcomes = []) {
  return outcomes.map((outcome) => {
    const economics = contributionValue(outcome);
    return { ...outcome, contribution_value: economics.value, value_confidence: economics.confidence, value_reason: economics.reason };
  }).sort((a, b) => {
    if (a.contribution_value === null && b.contribution_value === null) return 0;
    if (a.contribution_value === null) return 1;
    if (b.contribution_value === null) return -1;
    return b.contribution_value - a.contribution_value;
  });
}

function commercialObjectiveState({ measurement_verified = false, outcomes = [] } = {}) {
  const ranked = rankOutcomes(outcomes);
  const allValued = ranked.length > 0 && ranked.every((x) => x.contribution_value !== null);
  return {
    objective: "incremental_verified_customer_value",
    measurement_verified: Boolean(measurement_verified),
    value_model_complete: allValued,
    optimization_allowed: Boolean(measurement_verified && allValued),
    ranked_outcomes: ranked,
    guardrail: "Never substitute conversion volume for verified incremental customer value.",
  };
}

module.exports = { contributionValue, rankOutcomes, commercialObjectiveState };
