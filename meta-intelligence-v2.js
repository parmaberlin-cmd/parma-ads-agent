function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function classifyCampaign(campaign = {}) {
  const spend = number(campaign.spend);
  const clicks = number(campaign.clicks);
  const bookings = number(campaign.bookings);
  const impressions = number(campaign.impressions);
  if (impressions === 0 && spend === 0) return "no_delivery";
  if (spend > 0 && impressions === 0) return "anomalous_delivery";
  if (spend > 0 && clicks === 0) return "inefficient";
  if (clicks >= 20 && bookings === 0) return "no_conversion_signal";
  if (bookings >= 2) return "productive";
  return "insufficient_data";
}

function campaignIntelligence(campaigns = []) {
  return campaigns.map((campaign) => ({
    ...campaign,
    classification: classifyCampaign(campaign),
    ctr: ratio(number(campaign.clicks), number(campaign.impressions)),
    cost_per_booking: ratio(number(campaign.spend), number(campaign.bookings)),
  }));
}

function creativeIntelligence(creatives = []) {
  return creatives.map((creative) => {
    const ctr = ratio(number(creative.clicks), number(creative.impressions));
    const costPerBooking = ratio(number(creative.spend), number(creative.bookings));
    const enoughEvidence = number(creative.impressions) >= 1000 && number(creative.clicks) >= 20;
    return {
      ...creative,
      ctr,
      cost_per_booking: costPerBooking,
      evidence: enoughEvidence ? "usable" : "weak",
      fatigue_risk: number(creative.frequency) >= 3 && ctr !== null && ctr < 0.01,
    };
  });
}

function placementIntelligence(rows = []) {
  return rows.map((row) => ({
    ...row,
    ctr: ratio(number(row.clicks), number(row.impressions)),
    cost_per_booking: ratio(number(row.spend), number(row.bookings)),
    decision_allowed: number(row.clicks) >= 20,
  }));
}

function conversionConfidence({ metaBookings, ga4Bookings } = {}) {
  const meta = number(metaBookings);
  const ga4 = number(ga4Bookings);
  if (meta === 0 && ga4 === 0) return { confidence: "low", optimization_allowed: false, reason: "no_conversion_signal" };
  const delta = Math.abs(meta - ga4) / Math.max(meta, ga4, 1);
  if (delta <= 0.2) return { confidence: "high", optimization_allowed: true, reason: "sources_aligned", relative_delta: delta };
  if (delta <= 0.4) return { confidence: "medium", optimization_allowed: false, reason: "sources_partially_aligned", relative_delta: delta };
  return { confidence: "low", optimization_allowed: false, reason: "attribution_mismatch", relative_delta: delta };
}

function decisionConfidence({ evidenceCount = 0, dataConfidence = "low", attributionConfidence = "low", sampleSize = 0 } = {}) {
  let score = 0;
  if (dataConfidence === "high") score += 35;
  else if (dataConfidence === "partial" || dataConfidence === "medium") score += 20;
  if (attributionConfidence === "high") score += 30;
  else if (attributionConfidence === "medium") score += 15;
  score += Math.min(20, number(evidenceCount) * 4);
  if (number(sampleSize) >= 30) score += 15;
  else if (number(sampleSize) >= 10) score += 7;
  const confidence = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  return { score, confidence, executable: false, writes_allowed: false };
}

function detectMetaAnomalies(metrics = {}) {
  const anomalies = [];
  if (number(metrics.spend) > 0 && number(metrics.impressions) === 0) anomalies.push({ code: "spend_without_impressions", severity: "critical" });
  if (number(metrics.clicks) >= 20 && number(metrics.bookings) === 0) anomalies.push({ code: "clicks_without_bookings", severity: "high" });
  if (number(metrics.frequency) >= 4) anomalies.push({ code: "high_frequency", severity: "medium" });
  if (number(metrics.ctr) > 0 && number(metrics.previous_ctr) > 0 && number(metrics.ctr) < number(metrics.previous_ctr) * 0.6) anomalies.push({ code: "ctr_drop", severity: "high" });
  return anomalies;
}

function wasteDetector(rows = [], { minClicks = 15, maxCostPerBooking = null } = {}) {
  return rows
    .map((row) => {
      const spend = number(row.spend);
      const clicks = number(row.clicks);
      const bookings = number(row.bookings);
      const cpb = ratio(spend, bookings);
      let wasteScore = 0;
      const reasons = [];
      if (clicks >= minClicks && bookings === 0) { wasteScore += 60; reasons.push("clicks_without_bookings"); }
      if (maxCostPerBooking != null && cpb != null && cpb > number(maxCostPerBooking)) { wasteScore += 40; reasons.push("cost_per_booking_above_limit"); }
      return { ...row, waste_score: Math.min(100, wasteScore), waste_eur_estimate: bookings === 0 ? spend : 0, reasons };
    })
    .filter((row) => row.waste_score > 0)
    .sort((a, b) => b.waste_score - a.waste_score);
}

function opportunityDetector(rows = [], { minBookings = 2 } = {}) {
  const eligible = rows.filter((row) => number(row.bookings) >= minBookings && number(row.spend) > 0);
  const cpbs = eligible.map((row) => ratio(number(row.spend), number(row.bookings))).filter((value) => value != null);
  if (!cpbs.length) return [];
  const median = [...cpbs].sort((a, b) => a - b)[Math.floor(cpbs.length / 2)];
  return eligible
    .map((row) => ({ ...row, cost_per_booking: ratio(number(row.spend), number(row.bookings)) }))
    .filter((row) => row.cost_per_booking <= median)
    .sort((a, b) => a.cost_per_booking - b.cost_per_booking)
    .map((row) => ({ ...row, opportunity: "efficient_conversion_signal", executable: false }));
}

function budgetGuardrail({ currentBudget, proposedBudget, bookings, confidence } = {}) {
  const current = number(currentBudget);
  const proposed = number(proposedBudget);
  if (confidence !== "high" || number(bookings) < 3) return { allowed: false, reason: "insufficient_evidence" };
  if (current <= 0 || proposed <= 0) return { allowed: false, reason: "invalid_budget" };
  if (proposed > current * 1.2) return { allowed: false, reason: "increase_above_20_percent" };
  if (proposed < current * 0.8) return { allowed: false, reason: "decrease_above_20_percent" };
  return { allowed: true, reason: "guardrails_passed", execution_allowed: false };
}

function budgetSimulator({ currentBudget, conversionRate, cpc, changes = [-0.2, -0.1, 0.1, 0.2] } = {}) {
  const budget = number(currentBudget);
  const rate = number(conversionRate);
  const clickCost = number(cpc);
  return changes.map((change) => {
    const projectedBudget = budget * (1 + change);
    const projectedClicks = clickCost > 0 ? projectedBudget / clickCost : null;
    const projectedConversions = projectedClicks == null ? null : projectedClicks * rate;
    return {
      change,
      projected_budget: projectedBudget,
      projected_clicks: projectedClicks,
      projected_conversions: projectedConversions,
      is_simulation: true,
      execution_allowed: false,
    };
  });
}

function experimentPlan({ hypothesis, variants = [] } = {}) {
  return { mode: "shadow", status: "planned", hypothesis, variants, activation_allowed: false, requires_human_approval: true };
}

function evaluateWinner(rows = []) {
  const eligible = rows.filter((row) => number(row.clicks) >= 30 && number(row.bookings) >= 2);
  if (eligible.length < 2) return { winner: null, reason: "insufficient_evidence" };
  const ranked = eligible
    .map((row) => ({ ...row, cpb: ratio(number(row.spend), number(row.bookings)) }))
    .filter((row) => row.cpb != null)
    .sort((a, b) => a.cpb - b.cpb);
  return ranked.length ? { winner: ranked[0].name || null, reason: "lowest_cost_per_booking_with_minimum_evidence" } : { winner: null, reason: "insufficient_evidence" };
}

function fatigueDetector({ frequency, ctr, baselineCtr } = {}) {
  return { fatigue: Boolean(number(frequency) >= 3 && number(baselineCtr) > 0 && number(ctr) < number(baselineCtr) * 0.7) };
}

function audienceDiagnostics({ reach, frequency, ctr } = {}) {
  if (number(reach) === 0) return { state: "unknown" };
  if (number(frequency) >= 4) return { state: "saturation_risk" };
  if (number(ctr) < 0.005) return { state: "weak_response" };
  return { state: "healthy_or_insufficient_evidence" };
}

function landingAttribution({ adClicks, landingViews, bookingStarts, bookings, bookingStartTracked = true } = {}) {
  const clickToLanding = ratio(number(landingViews), number(adClicks));
  const landingToStart = bookingStartTracked ? ratio(number(bookingStarts), number(landingViews)) : null;
  const startToBooking = bookingStartTracked ? ratio(number(bookings), number(bookingStarts)) : null;
  let likely = "insufficient_data";
  if (clickToLanding !== null && clickToLanding < 0.6) likely = "ad_to_landing";
  else if (bookingStartTracked && landingToStart !== null && landingToStart < 0.1) likely = "landing_page";
  else if (bookingStartTracked && startToBooking !== null && startToBooking < 0.2) likely = "booking_funnel";
  return { click_to_landing: clickToLanding, landing_to_start: landingToStart, start_to_booking: startToBooking, likely_bottleneck: likely, booking_start_tracked: bookingStartTracked };
}

function bookingValue({ bookings, averageBookingValue, averageMarginRate = null } = {}) {
  const estimatedValue = number(bookings) * number(averageBookingValue);
  const marginRate = averageMarginRate == null ? null : number(averageMarginRate);
  return { estimated_value: estimatedValue, estimated_margin: marginRate == null ? null : estimatedValue * marginRate, is_estimate: true };
}

function costPerBookingGuardrail({ spend, bookings, maxCostPerBooking } = {}) {
  const cpb = ratio(number(spend), number(bookings));
  return { cost_per_booking: cpb, acceptable: cpb !== null && cpb <= number(maxCostPerBooking), decision_allowed: number(bookings) >= 2, execution_allowed: false };
}

function crossChannel({ google = {}, meta = {} } = {}) {
  return {
    google_role: "capture_existing_demand",
    meta_role: "generate_and_retarget_demand",
    warning: "do_not_compare_cpc_without_conversion_and_incrementality_context",
    google_cost_per_booking: ratio(number(google.spend), number(google.bookings)),
    meta_cost_per_booking: ratio(number(meta.spend), number(meta.bookings)),
  };
}

function dailyManager(signals = []) {
  const rank = { critical: 4, high: 3, medium: 2, low: 1 };
  return signals.slice().sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0)).slice(0, 3);
}

function weeklyStrategicReport({ current = {}, previous = {}, decisions = [] } = {}) {
  const metrics = ["spend", "clicks", "bookings", "cost_per_booking"];
  const trends = Object.fromEntries(metrics.map((metric) => {
    const before = number(previous[metric]);
    const after = number(current[metric]);
    const delta = after - before;
    return [metric, { current: after, previous: before, delta, relative_change: before !== 0 ? delta / Math.abs(before) : null }];
  }));
  return { mode: "shadow", writes_allowed: false, trends, decisions_reviewed: decisions.length };
}

function journalEntry({ decision, evidence, confidence, now = new Date() } = {}) {
  return { decision, evidence, confidence, created_at: now.toISOString(), executed: false, execution_status: "not_executed" };
}

function outcomeLearning({ before, after, metric, higherIsBetter = true } = {}) {
  const previous = number(before);
  const current = number(after);
  const delta = current - previous;
  return { metric, before: previous, after: current, delta, improved: higherIsBetter ? delta > 0 : delta < 0 };
}

function agentHealth({ sourceQuality = {}, lastRunAt, now = new Date(), maxRunAgeHours = 36, apiFailures = 0 } = {}) {
  const lastRun = lastRunAt ? new Date(lastRunAt) : null;
  const ageHours = lastRun && !Number.isNaN(lastRun.getTime()) ? Math.max(0, (now - lastRun) / 3600000) : null;
  const blockers = [];
  if (ageHours == null) blockers.push("last_run_unknown");
  else if (ageHours > maxRunAgeHours) blockers.push("shadow_run_stale");
  if (number(apiFailures) >= 3) blockers.push("repeated_api_failures");
  if (sourceQuality.confidence === "blocked") blockers.push("data_quality_blocked");
  return { healthy: blockers.length === 0, blockers, last_run_age_hours: ageHours, writes_allowed: false };
}

function autonomySchedule() {
  return {
    daily: ["source_health", "conversion_integrity", "anomalies", "waste", "opportunities", "priorities"],
    weekly: ["creative_fatigue", "audience", "placements", "cross_channel", "decision_outcomes"],
    conditional: ["budget_change", "experiment_winner", "write_action"],
    writes_allowed: false,
  };
}

function fullShadowAgentV2(input = {}) {
  const attribution = conversionConfidence(input.conversions || {});
  const anomalies = detectMetaAnomalies(input.meta || {});
  const campaigns = campaignIntelligence(input.campaigns || []);
  const priorities = dailyManager([...(input.signals || []), ...anomalies.map((item) => ({ ...item, source: "meta" }))]);
  return {
    mode: "shadow_v2",
    writes_allowed: false,
    execution_allowed: false,
    meta_campaigns: campaigns,
    meta_creatives: creativeIntelligence(input.creatives || []),
    placements: placementIntelligence(input.placements || []),
    conversion_confidence: attribution,
    waste: wasteDetector(campaigns, input.waste_policy || {}),
    opportunities: opportunityDetector(campaigns, input.opportunity_policy || {}),
    priorities,
    cross_channel: crossChannel(input.channels || {}),
    schedule: autonomySchedule(),
  };
}

module.exports = {
  classifyCampaign,
  campaignIntelligence,
  creativeIntelligence,
  placementIntelligence,
  conversionConfidence,
  decisionConfidence,
  detectMetaAnomalies,
  wasteDetector,
  opportunityDetector,
  budgetGuardrail,
  budgetSimulator,
  experimentPlan,
  evaluateWinner,
  fatigueDetector,
  audienceDiagnostics,
  landingAttribution,
  bookingValue,
  costPerBookingGuardrail,
  crossChannel,
  dailyManager,
  weeklyStrategicReport,
  journalEntry,
  outcomeLearning,
  agentHealth,
  autonomySchedule,
  fullShadowAgentV2,
};