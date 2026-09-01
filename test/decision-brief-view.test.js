const test = require('node:test');
const assert = require('node:assert/strict');
const { decisionBriefView } = require('../decision-brief-view');
const { renderDailyBriefItalian } = require('../daily-brief-italian');
const collected = '2026-09-01T12:00:00Z';
const brief = { generated_at: collected, source_evidence: { google: 'fresh', ga4: 'fresh', meta: 'fresh' }, priorities: [{ code: 'REVIEW_LOCAL_SEARCH_INTENT' }], direct_orders: { ready_for_order_optimization_review: true }, order_signals: { status: 'candidate_signals_observed' } };
const sources = Object.fromEntries(['google', 'ga4', 'meta'].map(key => [key, { collected_at: collected }]));

test('fresh view preserves the original report and timestamp without mutating it', () => {
  const text = JSON.stringify(brief);
  const view = decisionBriefView(brief, { liveSources: sources, now: new Date('2026-09-01T13:00:00Z') });
  assert.equal(view.snapshot_status, 'last_completed_snapshot');
  assert.equal(view.generated_at, collected); assert.equal(JSON.stringify(brief), text);
});
for (const [now, patch, status] of [
  ['2026-09-03T12:00:00Z', {}, 'stale_snapshot'],
  ['2026-09-01T11:00:00Z', {}, 'freshness_unverified'],
  ['2026-09-01T13:00:00Z', { refreshFailed: true }, 'last_refresh_failed'],
  ['2026-09-01T13:00:00Z', { liveSources: {} }, 'freshness_unverified'],
]) test(`non-current view with ${status} cannot carry current recommendations`, () => {
  const view = decisionBriefView(brief, { liveSources: sources, now: new Date(now), ...patch });
  assert.equal(view.snapshot_status, status); assert.equal(view.current_recommendations_available, false);
  assert.equal(view.priorities.length, 1); assert.equal(view.priorities[0].code, 'CHECK_SOURCE_EVIDENCE');
  assert.equal(view.direct_orders, null); assert.equal(view.order_signals.status, 'source_unverified');
  assert.equal(view.changes.notification_recommended, false);
  assert.equal(view.writes_allowed, false); assert.equal(view.spend_authorized, false);
  assert.match(renderDailyBriefItalian(view), /ATTENZIONE/);
});
test('unknown or impossible timestamps cannot be normalized into valid freshness', () => {
  for (const date of ['bad', '2026-02-30T12:00:00Z', '2026-09-01T24:00:00Z']) {
    assert.equal(decisionBriefView({ ...brief, generated_at: date }, { liveSources: sources }).snapshot_status, 'freshness_unverified');
  }
});
