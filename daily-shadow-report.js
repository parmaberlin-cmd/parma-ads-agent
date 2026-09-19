const { buildShadowDecisions, assertShadowSafe } = require("./shadow-decision-engine");
const { evaluateShadowDataQuality, assertQualityFailClosed } = require("./shadow-data-quality");
const { assessDirectOrders } = require("./direct-order-readiness");

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarizeChannel(channel = {}) {
  const spend = n(channel.cost ?? channel.spend);
  const clicks = n(channel.clicks);
  const bookings = n(channel.bookings ?? channel.conversions);
  return {
    spend_eur: spend,
    clicks,
    bookings,
    cpc_eur: clicks ? Number((spend / clicks).toFixed(2)) : null,
    cost_per_booking_eur: bookings ? Number((spend / bookings).toFixed(2)) : null,
  };
}

function buildRepairDecision(dataQuality) {
  const blockedChannels = Object.entries(dataQuality.channel_ready || {})
    .filter(([, ready]) => !ready)
    .map(([channel]) => channel);

  if (!blockedChannels.length) return null;

  return {
    channel: "system",
    action: "collect_or_repair_data",
    reason: `Recommendations withheld for: ${blockedChannels.join(", ")}. Blockers: ${(dataQuality.blockers || []).join(", ") || "insufficient evidence"}`,
    confidence: "high",
    mode: "shadow",
    executable: false,
  };
}

function buildDailyShadowReport(snapshot = {}) {
  const shadow = buildShadowDecisions(snapshot);
  assertShadowSafe(shadow);

  const dataQuality = snapshot.data_quality || evaluateShadowDataQuality(snapshot);
  assertQualityFailClosed(dataQuality);

  const trustedChannels = new Set(
    Object.entries(dataQuality.channel_ready || {})
      .filter(([, ready]) => ready)
      .map(([channel]) => channel)
  );

  const trustedDecisions = shadow.decisions.filter((decision) => trustedChannels.has(decision.channel));
  const repairDecision = buildRepairDecision(dataQuality);
  const decisions = repairDecision ? [repairDecision, ...trustedDecisions] : trustedDecisions;

  const report = {
    mode: "shadow",
    generated_at: shadow.generated_at,
    writes_allowed: false,
    spend_changed: false,
    data_quality: dataQuality,
    source_health: dataQuality.sources || snapshot.source_health || {},
    conversion_integrity: shadow.integrity,
    channels: {
      google: summarizeChannel(snapshot.google),
      meta: summarizeChannel(snapshot.meta),
    },
    top_priorities: decisions.slice(0, 3),
    observations: decisions.slice(3),
    journal: decisions.map((decision, index) => ({
      sequence: index + 1,
      timestamp: shadow.generated_at,
      channel: decision.channel,
      diagnosis: decision.reason,
      proposed_action: decision.action,
      mode: "shadow",
      executable: false,
      requires_human_approval: true,
      execution_status: "not_executed",
      verification_status: "not_applicable",
    })),
  };

  // Optional separate business objective: never relabel channel bookings as orders.
  // No evidence collector is implied; callers must explicitly supply page observations.
  if (snapshot.direct_orders !== undefined) {
    report.direct_orders = assessDirectOrders(snapshot.direct_orders, { now: shadow.generated_at });
  }

  if (report.writes_allowed !== false || report.spend_changed !== false) {
    throw new Error("daily shadow report violated no-write contract");
  }

  const leakedUntrustedDecision = report.top_priorities
    .concat(report.observations)
    .some((decision) => decision.channel !== "system" && !trustedChannels.has(decision.channel));
  if (leakedUntrustedDecision) {
    throw new Error("untrusted channel produced recommendation");
  }

  return report;
}

module.exports = { summarizeChannel, buildDailyShadowReport, buildRepairDecision };
