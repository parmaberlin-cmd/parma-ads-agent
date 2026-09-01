function triageAnomaly(input = {}) {
  const evidence = [];
  const hypotheses = [];
  if (input.source_health === false) {
    evidence.push("source_unhealthy"); hypotheses.push({ type: "measurement", confidence: "high", action: "repair_measurement_before_optimization" });
  }
  if (input.conversion_integrity === "degraded") {
    evidence.push("conversion_integrity_degraded"); hypotheses.push({ type: "measurement", confidence: "high", action: "block_conversion_dependent_optimization" });
  }
  if (Number(input.lost_is_budget) > Number(input.lost_is_rank)) {
    evidence.push("lost_is_budget_gt_rank"); hypotheses.push({ type: "budget_constraint", confidence: "descriptive_only", action: "simulate_only_until_value_verified" });
  } else if (Number(input.lost_is_rank) > Number(input.lost_is_budget)) {
    evidence.push("lost_is_rank_gt_budget"); hypotheses.push({ type: "rank_constraint", confidence: "descriptive_only", action: "inspect_relevance_quality_bid_without_auto_spend" });
  }
  if (input.window_mature === false) {
    evidence.push("window_immature"); hypotheses.push({ type: "data_maturity", confidence: "high", action: "wait_for_mature_window" });
  }
  if (input.clicks_change_pct !== undefined && input.impressions_change_pct !== undefined && Number(input.clicks_change_pct) < -20 && Number(input.impressions_change_pct) < -20) {
    hypotheses.push({ type: "demand_or_eligibility", confidence: "needs_reconciliation", action: "inspect_demand_schedule_geo_budget_rank" });
  }
  return {
    evidence,
    hypotheses,
    root_cause_proven: false,
    optimization_allowed: input.source_health !== false && input.conversion_integrity !== "degraded" && input.window_mature !== false,
    rule: "Triage classifies hypotheses; it never promotes correlation to cause.",
  };
}

module.exports = { triageAnomaly };
