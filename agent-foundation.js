const { assessConversionConfidence } = require('./conversion-confidence');
const { observedNumber } = require('./observed-number');

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function relativeDifference(a, b) {
  const left = Math.abs(numberOrZero(a));
  const right = Math.abs(numberOrZero(b));
  const denominator = Math.max(left, right, 1);
  return Math.abs(left - right) / denominator;
}

function assessConversionIntegrity({
  googleAdsConversions = null,
  ga4Bookings = null,
  googleLastSeenAt = null,
  ga4LastSeenAt = null,
  googleCollectedAt = null,
  ga4CollectedAt = null,
  now = new Date(),
  staleAfterHours = 48,
  toleranceRatio = 0.35,
  minimumComparableConversions = 3,
  reconciliationEvidence = {},
} = {}) {
  const googleAvailable = observedNumber(googleAdsConversions) !== null;
  const ga4Available = observedNumber(ga4Bookings) !== null;
  const reconciliation = assessConversionConfidence(reconciliationEvidence);
  const issues = [];

  if (!googleAvailable) issues.push("google_ads_conversion_signal_missing");
  if (!ga4Available) issues.push("ga4_booking_signal_missing");

  function freshness(timestamp, available, missingCode, staleCode) {
    if (!available) return { present: false, stale: null };
    if (!timestamp) {
      issues.push(missingCode);
      return { present: false, stale: null };
    }
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      issues.push(staleCode);
      return { present: true, stale: true };
    }
    const age = now.getTime() - parsed.getTime();
    const stale = age < 0 || age > staleAfterHours * 60 * 60 * 1000;
    if (stale) issues.push(staleCode);
    return { present: true, stale };
  }

  // Source freshness must describe when the collector successfully ran. The
  // latest business event can legitimately be old (for example, no paid
  // booking yesterday) without meaning that Google Ads or GA4 telemetry is
  // stale. Keep the legacy fallback for callers that have not been migrated.
  const googleFreshnessAt = googleCollectedAt || googleLastSeenAt;
  const ga4FreshnessAt = ga4CollectedAt || ga4LastSeenAt;
  const googleFreshness = freshness(googleFreshnessAt, googleAvailable, "google_ads_freshness_unknown", "google_ads_conversion_signal_stale");
  const ga4Freshness = freshness(ga4FreshnessAt, ga4Available, "ga4_freshness_unknown", "ga4_booking_signal_stale");

  let discrepancyRatio = null;
  let comparableVolume = false;
  if (googleAvailable && ga4Available) {
    const google = numberOrZero(googleAdsConversions);
    const ga4 = numberOrZero(ga4Bookings);
    discrepancyRatio = relativeDifference(google, ga4);
    comparableVolume = Math.max(Math.abs(google), Math.abs(ga4)) >= minimumComparableConversions;
    if (!comparableVolume) issues.push("conversion_volume_too_low_for_optimization");
    if (reconciliation.optimization_allowed && comparableVolume && discrepancyRatio > toleranceRatio) issues.push("conversion_sources_disagree");
  }

  let status = "healthy";
  let confidence = "high";
  if (!googleAvailable || !ga4Available) {
    status = "unverified";
    confidence = "low";
  } else if (issues.length > 0) {
    status = issues.includes("conversion_volume_too_low_for_optimization") && issues.length === 1 ? "unverified" : "degraded";
    confidence = status === "unverified" ? "low" : "medium";
  }

  if (!reconciliation.optimization_allowed) {
    issues.push('conversion_comparison_unverified');
    if (status === 'healthy') { status = 'unverified'; confidence = 'low'; }
  }

  return {
    status,
    confidence,
    optimization_allowed: status === "healthy" && comparableVolume && googleFreshness.stale === false && ga4Freshness.stale === false,
    google_ads_conversions: googleAvailable ? numberOrZero(googleAdsConversions) : null,
    ga4_bookings: ga4Available ? numberOrZero(ga4Bookings) : null,
    discrepancy_ratio: discrepancyRatio,
    discrepancy_is_descriptive_only: !reconciliation.optimization_allowed,
    reconciliation,
    tolerance_ratio: toleranceRatio,
    minimum_comparable_conversions: minimumComparableConversions,
    comparable_volume: comparableVolume,
    freshness: { google_ads: googleFreshness, ga4: ga4Freshness },
    business_event_recency: {
      google_ads_last_seen_at: googleLastSeenAt || null,
      ga4_last_seen_at: ga4LastSeenAt || null,
    },
    issues,
  };
}

function detectAnomalies({ current = {}, baseline = {}, access = {} } = {}) {
  const anomalies = [];
  const push = (code, severity, reason, channel = "cross_channel") => {
    anomalies.push({ code, severity, reason, channel });
  };

  if (access.google_ok === false) push("GOOGLE_ACCESS_FAILURE", "critical", "Google Ads live access is unavailable.", "google");
  if (access.meta_ok === false) push("META_ACCESS_FAILURE", "critical", "Meta live access is unavailable.", "meta");
  if (current.delivery_active === false && numberOrZero(baseline.impressions) > 0) push("DELIVERY_STOPPED", "critical", "Delivery is currently stopped despite prior delivery history.");

  const currentSpend = numberOrZero(current.spend);
  const baselineSpend = numberOrZero(baseline.spend);
  const currentClicks = numberOrZero(current.clicks);
  const currentConversions = numberOrZero(current.conversions);
  const baselineConversions = numberOrZero(baseline.conversions);
  const currentCpc = numberOrZero(current.cpc);
  const baselineCpc = numberOrZero(baseline.cpc);

  if (currentSpend >= Math.max(10, baselineSpend * 0.5) && observedNumber(current.clicks) === 0) push("SPEND_WITHOUT_CLICKS", "high", "Meaningful spend is present without clicks.");
  if (baselineConversions >= 3 && observedNumber(current.conversions) === 0 && currentClicks >= 5) push("CONVERSION_COLLAPSE", "high", "Conversions dropped to zero while traffic is still present.", "conversion");
  if (baselineCpc > 0 && currentCpc >= baselineCpc * 1.75 && currentClicks >= 3) push("CPC_SPIKE", "medium", "Current CPC is at least 75% above baseline.");

  const severityRank = { critical: 3, high: 2, medium: 1, low: 0 };
  anomalies.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.code.localeCompare(b.code));
  return anomalies;
}

function createDecisionJournalEntry({
  timestamp = new Date().toISOString(),
  channel,
  evidenceWindow,
  evidence = {},
  dataQuality,
  diagnosis,
  confidence,
  expectedEffect,
  proposedAction,
  requiresAuthorization = false,
  approvalState = "not_requested",
  execution = null,
  verification = null,
  measurementWindow = null,
  outcome = null,
} = {}) {
  if (!channel || !diagnosis || !proposedAction) {
    throw new Error("channel, diagnosis and proposedAction are required");
  }

  return {
    timestamp,
    channel,
    evidence_window: evidenceWindow || null,
    evidence,
    data_quality: dataQuality || "unknown",
    diagnosis,
    confidence: confidence || "unknown",
    expected_effect: expectedEffect || null,
    proposed_action: proposedAction,
    requires_authorization: Boolean(requiresAuthorization),
    approval_state: approvalState,
    execution,
    verification,
    measurement_window: measurementWindow,
    outcome,
  };
}

function finalizeDecisionJournalEntry(entry, { execution, verification, outcome } = {}) {
  if (!entry || typeof entry !== "object") throw new Error("entry is required");
  return {
    ...entry,
    execution: execution ?? entry.execution,
    verification: verification ?? entry.verification,
    outcome: outcome ?? entry.outcome,
  };
}

module.exports = {
  assessConversionIntegrity,
  createDecisionJournalEntry,
  detectAnomalies,
  finalizeDecisionJournalEntry,
};
