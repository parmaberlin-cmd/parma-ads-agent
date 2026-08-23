const { assertPublicPayloadSafe } = require('./public-output-safety');

function safeArray(value, max = 5) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function trackingObserved(value) {
  if (value && typeof value === 'object') return value.observed === true;
  return value === true;
}

function trackingConfigured(value) {
  if (value && typeof value === 'object') return value.configured === true;
  return value === true;
}

function buildOperationalDashboard({ summary = {}, cycle = {}, promotion = {} } = {}) {
  const sourceHealth = summary.source_health || cycle.stages?.collect?.sources || {};
  const dataQuality = summary.data_quality || {};
  const tracking = summary.tracking || {};
  const alerts = cycle.operational?.alerts || [];
  const priorities = summary.primary_priorities || cycle.operational?.priorities || [];
  const blockers = [...new Set([...(dataQuality.blockers || []), ...(promotion.blockers || []), ...(cycle.blocked_stages || []).map((stage) => `cycle_${stage}`)])];
  const dashboard = {
    mode: 'shadow',
    generated_at: summary.generated_at || cycle.generated_at || new Date().toISOString(),
    status: blockers.length ? 'attention' : 'normal',
    sources: {
      google: sourceHealth.google === true ? 'ok' : 'blocked',
      ga4: sourceHealth.ga4 === true ? 'ok' : 'blocked',
      meta: sourceHealth.meta === true ? 'ok' : 'blocked',
    },
    data_confidence: dataQuality.confidence || 'unknown',
    conversion_integrity: summary.conversion_integrity?.status || 'unknown',
    tracking: {
      reservation_page_view: {
        configured: trackingConfigured(tracking.reservation_page_view),
        observed: trackingObserved(tracking.reservation_page_view),
      },
      reservation_start: {
        configured: trackingConfigured(tracking.reservation_start),
        observed: trackingObserved(tracking.reservation_start),
      },
      booking_completed: {
        configured: trackingConfigured(tracking.booking_completed),
        observed: trackingObserved(tracking.booking_completed),
      },
    },
    history: summary.history || cycle.history || { total_runs: 0 },
    readiness: {
      promotion_ready: promotion.promotion_ready === true,
      autonomy_class: promotion.autonomy_class || 'observe_and_propose',
      score: promotion.readiness_score ?? null,
    },
    blockers: safeArray(blockers, 12),
    alerts: safeArray(alerts.map((alert) => ({ severity: alert.severity, code: alert.code, source: alert.source })), 8),
    priorities: safeArray(priorities.map((priority) => ({ code: priority.code || null, severity: priority.severity || null, source: priority.source || priority.channel || null, requires_authorization: priority.requires_authorization === true })), 3),
    writes_allowed: false,
    execution_allowed: false,
    spend_allowed: false,
  };
  return assertPublicPayloadSafe(dashboard);
}

module.exports = { safeArray, trackingObserved, trackingConfigured, buildOperationalDashboard };