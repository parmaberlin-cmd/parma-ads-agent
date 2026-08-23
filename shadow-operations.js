const { agentHealth } = require('./meta-intelligence-v2');

function buildAlerts({ dataQuality = {}, anomalies = [], health = {} } = {}) {
  const alerts = [];
  for (const blocker of dataQuality.blockers || []) {
    alerts.push({ severity: blocker.includes('unavailable') || blocker.includes('stale') ? 'high' : 'medium', code: blocker, source: 'data_quality' });
  }
  for (const anomaly of anomalies || []) {
    const item = typeof anomaly === 'string' ? { code: anomaly, severity: 'medium' } : anomaly;
    alerts.push({ severity: item.severity || 'medium', code: item.code || 'unknown_anomaly', source: 'anomaly' });
  }
  for (const blocker of health.blockers || []) {
    alerts.push({ severity: blocker === 'repeated_api_failures' ? 'critical' : 'high', code: blocker, source: 'agent_health' });
  }
  const rank = { critical: 4, high: 3, medium: 2, low: 1 };
  return alerts.sort((a, b) => (rank[b.severity] || 0) - (rank[a.severity] || 0));
}

function buildDailyOperationalSummary({ snapshot = {}, shadowReport = {}, lastRunAt = null, apiFailures = 0 } = {}) {
  const dataQuality = snapshot.data_quality || shadowReport.data_quality || {};
  const health = agentHealth({ sourceQuality: dataQuality, lastRunAt: lastRunAt || snapshot.now || new Date().toISOString(), apiFailures });
  const alerts = buildAlerts({ dataQuality, anomalies: shadowReport.anomalies || [], health });
  const needsAttention = alerts.some((alert) => ['critical', 'high'].includes(alert.severity));
  return {
    mode: 'shadow',
    generated_at: new Date().toISOString(),
    status: needsAttention ? 'attention' : 'normal',
    confidence: dataQuality.confidence || 'unknown',
    channel_ready: dataQuality.channel_ready || {},
    blockers: dataQuality.blockers || [],
    alerts: alerts.slice(0, 10),
    priorities: (shadowReport.top_priorities || shadowReport.daily_manager || []).slice(0, 3),
    writes_allowed: false,
    execution_allowed: false,
  };
}

function buildWeeklyOperationalSummary({ dailySummaries = [] } = {}) {
  const total = dailySummaries.length;
  const attentionDays = dailySummaries.filter((summary) => summary.status === 'attention').length;
  const highConfidenceDays = dailySummaries.filter((summary) => summary.confidence === 'high').length;
  const alertCounts = {};
  for (const summary of dailySummaries) {
    for (const alert of summary.alerts || []) alertCounts[alert.code] = (alertCounts[alert.code] || 0) + 1;
  }
  return {
    mode: 'shadow',
    days_observed: total,
    attention_days: attentionDays,
    high_confidence_ratio: total ? highConfidenceDays / total : null,
    recurring_alerts: Object.entries(alertCounts).filter(([, count]) => count >= 2).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    writes_allowed: false,
    execution_allowed: false,
  };
}

module.exports = { buildAlerts, buildDailyOperationalSummary, buildWeeklyOperationalSummary };