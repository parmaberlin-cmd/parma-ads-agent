const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { evaluateShadowDataQuality } = require('../shadow-data-quality');
const { reportingScope } = require('../reporting-scope');
const { loadHistory } = require('../shadow-history-store');
const { buildShadowAgentReport } = require('../agent-shadow');
const root = path.join(__dirname, '..');

function snapshot(at, { meta = true, issues = 2, clicks = 20 } = {}) {
  const value = {
    now: at, access: { google_ok: true, ga4_ok: true, meta_ok: meta },
    live_sources: Object.fromEntries(['google', 'ga4', 'meta'].map(name => [name, { access_ok: name !== 'meta' || meta, collected_at: at }])),
    conversions: { google_ads_conversions: 10, booking_completed: 106, google_collected_at: at, ga4_collected_at: at },
    meta: { campaign_counts: { with_issues: issues } },
  };
  Object.assign(value.live_sources.google, { totals: { clicks, spend_eur: 10, conversions: 10 }, reporting_scope: reportingScope('google', '123', 'test'), period: { start: '2026-08-02', end: '2026-08-31' }, search_intelligence_ok: true });
  value.live_sources.ga4.event_inventory = { order_candidates: [{ event_name: 'purchase', event_count: 4 }] };
  value.data_quality = evaluateShadowDataQuality(value, { now: new Date(at) });
  return value;
}

function harness(file, initialTime) {
  const actualRequire = createRequire(path.join(root, 'bootstrap.js'));
  let clock = Date.parse(initialTime), next = snapshot(initialTime);
  const logs = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const cache = { express: { exports: () => ({ get() {}, post() {} }) } };
  const stubs = {
    './meta-paused-draft-next': { META_API_VERSION: 'test-only' },
    './full-live-shadow-data': { collectFullLiveShadowInput: async () => next },
    './meta-runtime-preflight': { registerMetaRealPreflightRoute() {} },
    './meta-safe-create-route': { registerMetaSafeCreateRoute() {} },
    './meta-preflight-status': { state: {}, run: async () => {} }, './server': {},
  };
  const isolatedRequire = name => name === 'express' ? cache.express.exports : Object.hasOwn(stubs, name) ? stubs[name] : actualRequire(name);
  isolatedRequire.resolve = name => name; isolatedRequire.cache = cache;
  const context = { require: isolatedRequire, Date: Clock, module: { exports: {} }, process: { env: { SHADOW_HISTORY_PATH: file } },
    console: Object.fromEntries(['log', 'warn', 'error'].map(name => [name, text => logs.push(text)])) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'bootstrap.js'), 'utf8') + '\nmodule.exports = { state, triggerShadowReport, buildRuntimeViews };', context);
  const runtime = context.module.exports;
  return { runtime, logs, set(at, options) { clock = Date.parse(at); next = snapshot(at, options); } };
}

test('actual runtime compares consecutive runs, survives restart and does not resolve outages on missing data', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parma-memory-cycle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'history.json');
  const app = harness(file, '2026-09-01T12:00:00Z');
  await app.runtime.triggerShadowReport();
  assert.equal(app.runtime.state.result.decision_brief.changes.status, 'baseline_unavailable');
  app.set('2026-09-01T13:00:00Z'); await app.runtime.triggerShadowReport();
  assert.equal(app.runtime.state.result.decision_brief.changes.material_change, false);
  app.set('2026-09-01T14:00:00Z', { meta: false }); await app.runtime.triggerShadowReport();
  assert.ok(app.runtime.state.result.decision_brief.changes.priorities.unverifiable.includes('DIAGNOSE_META_DELIVERY'));
  assert.equal(loadHistory(file).length, 3);

  const restarted = harness(file, '2026-09-02T12:00:00Z');
  await restarted.runtime.triggerShadowReport();
  const view = restarted.runtime.buildRuntimeViews();
  assert.equal(view.summary.decision_brief.changes.baseline_at, '2026-09-01T14:00:00.000Z');
  assert.equal(view.summary.history.total_runs, 4);
  assert.match(view.summary.daily_brief_text, /PARMA ADS/);
  assert.equal(view.summary.decision_brief.order_signals.verified_orders, null);
  assert.equal(view.summary.decision_brief.engineering_queue.execution_authorized, false);
  assert.equal(view.summary.writes_allowed, false);
  assert.equal(view.summary.decision_brief.changes.notification_sent, false);
  restarted.set('2026-09-04T12:00:00Z'); // advance time without a refresh
  const staleView = restarted.runtime.buildRuntimeViews();
  assert.equal(staleView.summary.decision_brief.snapshot_status, 'stale_snapshot');
  assert.equal(staleView.summary.data_quality.confidence, 'blocked');
  assert.equal(staleView.summary.conversion_integrity.optimization_allowed, false);
  assert.equal(staleView.summary.primary_priorities[0].code, 'CHECK_SOURCE_EVIDENCE');
  assert.equal(staleView.cycle.stages.validate.passed, false);
  assert.equal(loadHistory(file).length, 4);
});

test('runtime preserves a corrupted history file instead of overwriting evidence of failure', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parma-memory-corrupt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'history.json');
  fs.writeFileSync(file, '{private-corruption-marker');
  const app = harness(file, '2026-09-01T12:00:00Z');
  await app.runtime.triggerShadowReport();
  assert.equal(fs.readFileSync(file, 'utf8'), '{private-corruption-marker');
  const views = app.runtime.buildRuntimeViews();
  assert.equal(views.summary.history.storage.healthy, false);
  assert.equal(views.summary.decision_brief.changes.status, 'history_unhealthy');
  assert.equal(views.cycle.stages.history.complete, false);
  assert.equal(JSON.stringify(views).includes('private-corruption-marker'), false);
  assert.equal(app.logs.join('').includes('private-corruption-marker'), false);
});

test('runtime report can propose another delegated task while an external task is blocked', () => {
  const input = snapshot('2026-09-01T12:00:00Z');
  input.work_queue = [
    { id: 'WIX', status: 'BLOCKED_EXTERNAL', priority: 'P0' },
    { id: 'TEST', status: 'READY', priority: 'P1', autonomous: true, permission_class: 'GREEN', operation: 'test', task: 'private-description-marker' },
  ];
  const queue = buildShadowAgentReport(input).decision_brief.engineering_queue;
  assert.equal(queue.selected_id, 'TEST'); assert.equal(queue.status, 'work_available');
  assert.equal(queue.execution_authorized, false);
  assert.equal(JSON.stringify(queue).includes('private-description-marker'), false);
});

test('campaign metrics succeeding cannot hide a failed search-term sub-collection', () => {
  const input = snapshot('2026-09-01T12:00:00Z');
  input.live_sources.google.search_intelligence_ok = false;
  const report = buildShadowAgentReport(input);
  assert.ok(report.decision_brief.priorities.some(x => x.code === 'CHECK_SEARCH_COLLECTION'));
  assert.equal(report.decision_brief.priorities.some(x => x.code === 'REVIEW_LOCAL_SEARCH_INTENT'), false);
});
