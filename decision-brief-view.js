const { timestamp } = require('./report-memory');
const { diagnoseOrderSignals } = require('./order-signal-diagnostics');

function decisionBriefView(brief, { liveSources = {}, refreshFailed = false, now = new Date(), maxAgeHours = 36 } = {}) {
  if (!brief) return undefined;
  const at = now.getTime(), generated = timestamp(brief.generated_at);
  const limit = typeof maxAgeHours === 'number' && Number.isFinite(maxAgeHours) && maxAgeHours > 0 ? Math.min(maxAgeHours, 36) : 36;
  const age = generated === null || !Number.isFinite(at) ? null : (at - generated) / 3600000;
  let status = refreshFailed ? 'last_refresh_failed' : age === null || age < 0 ? 'freshness_unverified' : age > limit ? 'stale_snapshot' : 'last_completed_snapshot';
  const sources = {};
  for (const source of ['google', 'ga4', 'meta']) {
    const collected = timestamp(liveSources[source]?.collected_at);
    const sourceAge = collected === null ? null : (at - collected) / 3600000;
    const claimed = brief.source_evidence?.[source];
    sources[source] = claimed === 'fresh' && sourceAge !== null && sourceAge >= 0 && sourceAge <= limit ? 'fresh' : claimed === 'unavailable' ? 'unavailable' : 'unverified';
    if (claimed === 'fresh' && sources[source] !== 'fresh' && status === 'last_completed_snapshot') status = 'freshness_unverified';
  }
  if (status === 'last_completed_snapshot') return { ...brief, source_evidence: sources, snapshot_status: status, current_recommendations_available: true, snapshot_age_hours: age };
  // Preserve history internally, but never present stale recommendations as current work.
  return {
    ...brief, source_evidence: sources, snapshot_status: status, current_recommendations_available: false,
    snapshot_age_hours: age === null || age < 0 ? null : age,
    historical_priority_count: Array.isArray(brief.priorities) ? brief.priorities.length : 0,
    priorities: [{ code: 'CHECK_SOURCE_EVIDENCE', priority: 100,
      action: 'Refresh read-only diagnostics before using previous recommendations.',
      evidence: { current_snapshot_verified: false }, expected_benefit_hypothesis: 'Avoid decisions based on outdated evidence.',
      business_effect_verified: false, risk: 'read_only_analysis', blocker: null,
      autonomous_next_step_available: true, requires_authorization: false, executable: false, execution_status: 'not_executed' }],
    deferred_actions: [], next_autonomous_action: 'CHECK_SOURCE_EVIDENCE',
    direct_orders: null, order_signals: diagnoseOrderSignals(),
    changes: { status: 'current_snapshot_unverified', material_change: null, notification_recommended: false, notification_sent: false },
    writes_allowed: false, spend_authorized: false, tracking_mutation_authorized: false, deploy_authorized: false,
  };
}
module.exports = { decisionBriefView };
