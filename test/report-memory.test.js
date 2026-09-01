const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOperationalCheckpoint, compareOperationalHistory, period } = require('../report-memory');
const { reportingScope } = require('../reporting-scope');
const { buildSanitizedHistoryRecord } = require('../shadow-history-store');

const at = '2026-09-01T12:00:00Z';
function checkpoint(date = at) {
  return buildOperationalCheckpoint({ generatedAt: date,
    snapshot: { live_sources: { google: { reporting_scope: reportingScope('google', '123', 'test'), period: { start: '2026-08-02', end: '2026-08-31' }, totals: { clicks: 20, spend_eur: 10, conversions: 3 }, search_intelligence_ok: true } } },
    report: { decision_brief: { source_evidence: { google: 'fresh', ga4: 'fresh', meta: 'fresh' }, priorities: [{ code: 'RECONCILE_BUSINESS_OUTCOMES' }, { code: 'DIAGNOSE_META_DELIVERY' }], deferred_actions: [{ code: 'REVIEW_LOCAL_SEARCH_INTENT' }] } },
  });
}
function compare(current, prior = checkpoint(), options = {}) {
  return compareOperationalHistory({ current, history: [{ operational_checkpoint: prior }], ...options });
}
test('checkpoint keeps allowlisted evidence without account identifiers, names or raw errors', () => {
  const cp = buildOperationalCheckpoint({ generatedAt: at, snapshot: { error: 'private-marker', live_sources: { google: { customer_id: 'private-marker', totals: { clicks: 'private-marker' } } } }, report: { decision_brief: { priorities: [{ code: 'private-marker' }] } } });
  assert.equal(JSON.stringify(cp).includes('private-marker'), false);
  assert.equal(cp.google.metrics.clicks, null);
  assert.deepEqual(cp.priority_codes, []);
});
test('same snapshot produces persistent priorities and no repeated notification recommendation', () => {
  const current = checkpoint('2026-09-01T13:00:00Z');
  const r = compare(current);
  assert.equal(r.status, 'compared'); assert.equal(r.material_change, false);
  assert.equal(r.notification_recommended, false); assert.equal(r.notification_sent, false);
  assert.equal(r.priorities.persistent.length, 3);
});
test('deferred priorities moving into top five are not incorrectly treated as new', () => {
  const current = checkpoint('2026-09-01T13:00:00Z');
  current.priority_codes.reverse();
  assert.deepEqual(compare(current).priorities.new, []);
});
test('disappearance with healthy sources means not observed, not proven resolved', () => {
  const current = checkpoint('2026-09-01T13:00:00Z');
  current.priority_codes = current.priority_codes.filter(x => x !== 'DIAGNOSE_META_DELIVERY');
  const r = compare(current);
  assert.deepEqual(r.priorities.no_longer_observed, ['DIAGNOSE_META_DELIVERY']);
  assert.equal(r.resolved, undefined); assert.equal(r.material_change, true);
});
test('disappearance during source failure or missing sub-collection is unverifiable', () => {
  const current = checkpoint('2026-09-01T13:00:00Z');
  current.priority_codes = []; current.source_evidence.meta = 'unavailable'; current.coverage.search_terms = false;
  const r = compare(current);
  assert.ok(r.priorities.unverifiable.includes('DIAGNOSE_META_DELIVERY'));
  assert.ok(r.priorities.unverifiable.includes('REVIEW_LOCAL_SEARCH_INTENT'));
  assert.deepEqual(r.source_changes, [{ source: 'meta', before: 'fresh', after: 'unavailable' }]);
});
test('expired or absent direct-order evidence cannot resolve an ordering concern', () => {
  const previous = checkpoint(), current = checkpoint('2026-09-01T13:00:00Z');
  previous.priority_codes.push('REVIEW_DIRECT_ORDER_EVIDENCE');
  assert.ok(compare(current, previous).priorities.unverifiable.includes('REVIEW_DIRECT_ORDER_EVIDENCE'));
});
test('same-scope same-period count changes are revisions, never a daily-growth claim', () => {
  const current = checkpoint('2026-09-01T13:00:00Z'); current.google.metrics.clicks = 23;
  const r = compare(current);
  assert.equal(r.metrics.status, 'same_window_revision');
  assert.deepEqual(r.metrics.changes, [{ metric: 'clicks', before: 20, after: 23, delta: 3 }]);
  assert.equal(r.material_change, true); assert.equal(r.daily_growth, undefined);
});
for (const [field, value, reason] of [
  ['scope', null, 'reporting_scope_unverified_or_changed'],
  ['scope', reportingScope('google', '456', 'test'), 'reporting_scope_unverified_or_changed'],
  ['period', null, 'period_unknown'],
  ['period', { start: '2026-08-03', end: '2026-09-01' }, 'different_windows_not_a_daily_trend'],
]) test(`unmatched ${field} blocks a numeric comparison`, () => {
  const current = checkpoint('2026-09-01T13:00:00Z'); current.google[field] = value;
  current.google.metrics.clicks = 999;
  const r = compare(current);
  assert.equal(r.metrics.reason, reason); assert.deepEqual(r.metrics.changes, []);
});
for (const metric of ['impressions', 'clicks', 'spend_eur', 'conversion_signals']) test(`unknown ${metric} is not zero or a collapse`, () => {
  const current = checkpoint('2026-09-01T13:00:00Z'); current.google.metrics[metric] = null;
  assert.equal(compare(current).metrics.changes.some(row => row.metric === metric), false);
});
test('baseline selection is chronological, ignores same/future runs and accepts old history schema', () => {
  const older = checkpoint('2026-09-01T10:00:00Z'), recent = checkpoint();
  const r = compareOperationalHistory({ current: checkpoint('2026-09-01T13:00:00Z'), history: [
    { generated_at: 'legacy' }, { operational_checkpoint: recent }, { operational_checkpoint: checkpoint('2026-09-02T13:00:00Z') },
    { operational_checkpoint: older }, { operational_checkpoint: checkpoint('2026-09-01T13:00:00Z') },
  ] });
  assert.equal(r.baseline_at, '2026-09-01T12:00:00.000Z');
});
test('unhealthy, empty and gapped history cannot claim no change', () => {
  assert.equal(compare(checkpoint('2026-09-01T13:00:00Z'), checkpoint(), { historyHealthy: false }).material_change, null);
  assert.equal(compare(checkpoint('2026-09-10T13:00:00Z')).status, 'history_gap');
  assert.equal(compareOperationalHistory({ current: checkpoint(), history: [] }).status, 'baseline_unavailable');
});
test('history receives checkpoint without erasing its existing schema', () => {
  const record = buildSanitizedHistoryRecord({ generatedAt: at });
  assert.equal(record.id, at); assert.equal(record.operational_checkpoint.version, 1);
  assert.equal(record.outcome, null);
});
for (const invalid of [{ start: '2026-02-30', end: '2026-03-01' }, { start: '2026-09-02', end: '2026-09-01' }, { start: 'x', end: 'x' }, null]) {
  test(`invalid reporting period is rejected: ${JSON.stringify(invalid)}`, () => assert.equal(period(invalid), null));
}
test('reporting scope is stable and separates account and query definitions', () => {
  assert.equal(reportingScope('google', '123', 'test'), reportingScope('google', '123', 'test'));
  assert.notEqual(reportingScope('google', '123', 'test'), reportingScope('google', '123', 'changed'));
  assert.equal(reportingScope('google', 'private-marker', 'test'), null);
});
