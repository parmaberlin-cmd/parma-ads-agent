const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAlerts, buildDailyOperationalSummary, buildWeeklyOperationalSummary } = require('../shadow-operations');

test('alerts prioritize critical health failures', () => {
  const alerts = buildAlerts({
    dataQuality: { blockers: ['ga4_stale'] },
    anomalies: [{ code: 'ctr_drop', severity: 'high' }],
    health: { blockers: ['repeated_api_failures'] },
  });
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(alerts[0].code, 'repeated_api_failures');
});

test('daily operational summary stays shadow-only', () => {
  const summary = buildDailyOperationalSummary({
    snapshot: { now: new Date().toISOString(), data_quality: { confidence: 'high', channel_ready: { google: true, meta: true }, blockers: [] } },
    shadowReport: { anomalies: [], top_priorities: [{ channel: 'google', action: 'observe' }] },
  });
  assert.equal(summary.status, 'normal');
  assert.equal(summary.writes_allowed, false);
  assert.equal(summary.execution_allowed, false);
});

test('weekly operational summary finds recurring alerts', () => {
  const weekly = buildWeeklyOperationalSummary({ dailySummaries: [
    { status: 'attention', confidence: 'high', alerts: [{ code: 'ga4_stale' }] },
    { status: 'attention', confidence: 'partial', alerts: [{ code: 'ga4_stale' }] },
    { status: 'normal', confidence: 'high', alerts: [] },
  ] });
  assert.equal(weekly.days_observed, 3);
  assert.equal(weekly.recurring_alerts[0].code, 'ga4_stale');
  assert.equal(weekly.writes_allowed, false);
});