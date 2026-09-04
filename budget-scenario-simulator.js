function simulateBudgetScenarios({ current_daily_budget, scenarios = [], measurement_verified = false, marginal_response_verified = false } = {}) {
  const current = Number(current_daily_budget);
  if (!Number.isFinite(current) || current <= 0) throw new TypeError("current_daily_budget must be positive");
  return scenarios.map((raw) => {
    const budget = Number(raw);
    if (!Number.isFinite(budget) || budget <= 0) throw new TypeError("scenario budget must be positive");
    const increase = budget > current;
    const evidenceReady = Boolean(measurement_verified && marginal_response_verified);
    return {
      daily_budget_eur: budget,
      delta_eur: Number((budget - current).toFixed(2)),
      delta_pct: Number((((budget / current) - 1) * 100).toFixed(1)),
      scenario_only: true,
      recommendation_allowed: !increase || evidenceReady,
      execution_allowed: false,
      spend_authorized: false,
      blocker: increase && !evidenceReady ? "verified_conversion_and_marginal_response_required" : null,
    };
  });
}

module.exports = { simulateBudgetScenarios };
