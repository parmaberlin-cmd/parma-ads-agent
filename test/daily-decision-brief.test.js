const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDailyDecisionBrief } = require('../daily-decision-brief');
const { buildShadowAgentReport } = require('../agent-shadow');
const { evaluateShadowDataQuality } = require('../shadow-data-quality');
const { assertPublicPayloadSafe } = require('../public-output-safety');
const { buildSanitizedHistoryRecord } = require('../shadow-history-store');
const { buildReadonlyCycleState } = require('../shadow-readonly-cycle');
const now = new Date('2026-09-01T12:00:00Z');

function snapshot() {
  const input = {
    now: now.toISOString(),
    access: { google_ok: true, ga4_ok: true, meta_ok: true },
    live_sources: Object.fromEntries(['google', 'ga4', 'meta'].map(name => [name, { access_ok: true, collected_at: now.toISOString(), totals: { clicks: 20 } }])),
    conversions: { google_ads_conversions: 10, booking_completed: 106, google_collected_at: now.toISOString(), ga4_collected_at: now.toISOString() },
    meta: { campaign_counts: { with_issues: 5 } }, search_terms: [{ search_term: 'pizza near me', clicks: 20 }],
  };
  input.data_quality = evaluateShadowDataQuality(input, { now });
  return input;
}

test('actual shadow report includes five evidenced priorities, not promised customers', () => {
  const report = buildShadowAgentReport(snapshot());
  const brief = report.decision_brief;
  assert.equal(brief.priorities.length, 5);
  assert.equal(brief.priorities[0].code, 'RECONCILE_BUSINESS_OUTCOMES');
  assert.equal(brief.next_autonomous_action, brief.priorities[0].code);
  for (const item of brief.priorities) {
    assert.ok(item.action && item.expected_benefit_hypothesis && item.evidence);
    assert.equal(item.business_effect_verified, false);
    assert.equal(item.executable, false);
    assert.equal(item.requires_authorization, false);
  }
  for (const key of ['writes_allowed', 'spend_authorized', 'tracking_mutation_authorized', 'deploy_authorized']) assert.equal(brief[key], false);
  assert.doesNotThrow(() => assertPublicPayloadSafe(brief));
});
test('empty input does not fabricate five findings or a live-access claim', () => {
  const brief = buildDailyDecisionBrief({ now });
  assert.equal(brief.priorities.length, 2);
  assert.equal(brief.source_evidence.google, 'unverified');
  assert.equal(brief.priorities[1].evidence.google_conversion_signals, null);
});
test('unavailable or stale sources suppress performance recommendations', () => {
  const input = snapshot(); input.access.google_ok = false;
  input.live_sources.meta.collected_at = '2020-01-01T00:00:00Z';
  input.data_quality = evaluateShadowDataQuality(input, { now });
  const brief = buildShadowAgentReport(input).decision_brief;
  assert.equal(brief.priorities.some(x => ['REVIEW_LOCAL_SEARCH_INTENT', 'REVIEW_DEMAND_DISTRIBUTION', 'DIAGNOSE_META_DELIVERY'].includes(x.code)), false);
  assert.equal(brief.next_autonomous_action, 'CHECK_SOURCE_EVIDENCE');
});
test('diagnostic brief does not echo arbitrary credentials, errors, names or IDs', () => {
  const input = snapshot();
  input.error = 'sensitive-test-marker'; input.access_token = 'sensitive-test-marker';
  input.search_terms[0].search_term = 'sensitive-test-marker';
  input.conversions.google_ads_conversions = 'sensitive-test-marker';
  const brief = buildShadowAgentReport(input).decision_brief;
  assert.equal(JSON.stringify(brief).includes('sensitive-test-marker'), false);
  assert.doesNotThrow(() => assertPublicPayloadSafe(brief));
});
test('direct-order observations remain separate and expire in the runtime brief', () => {
  const input = snapshot();
  input.direct_orders = require('../docs/diagnostics/direct-order-checkout-observation-2026-09-01.json');
  const brief = buildDailyDecisionBrief({ input, now: new Date('2026-09-03T12:00:00Z') });
  assert.equal(brief.direct_orders.journey.status, 'unverified');
  assert.equal(brief.direct_orders.ready_for_order_optimization_review, false);
});
test('priorities flow from report into cycle and sanitized history, including the fifth action', () => {
  const input = snapshot(), report = buildShadowAgentReport(input);
  const record = buildSanitizedHistoryRecord({ snapshot: input, report, generatedAt: now.toISOString() });
  assert.deepEqual(record.priority_codes, report.decision_brief.priorities.map(x => x.code));
  const cycle = buildReadonlyCycleState({ snapshot: input, report, history: [record], historyStorage: { healthy: true }, now });
  assert.equal(cycle.stages.prioritize.priority_count, 5);
  assert.equal(cycle.writes_allowed, false);
  assert.doesNotThrow(() => assertPublicPayloadSafe(record));
});
test('failed history persistence is not reported as a completed cycle stage', () => {
  const cycle = buildReadonlyCycleState({ historyStorage: { healthy: false }, now });
  assert.equal(cycle.stages.history.complete, false);
  assert.ok(cycle.blocked_stages.includes('history'));
});
