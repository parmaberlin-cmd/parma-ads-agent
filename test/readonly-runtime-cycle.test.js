const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { evaluateShadowDataQuality } = require('../shadow-data-quality');
const { loadHistory } = require('../shadow-history-store');
const root = path.join(__dirname, '..');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function collectorFixture() {
  const now = new Date();
  const snapshot = {
    now: now.toISOString(), access: { google_ok: true, ga4_ok: true, meta_ok: true },
    live_sources: Object.fromEntries(['google', 'ga4', 'meta'].map(name => [name, { access_ok: true, collected_at: now.toISOString(), totals: { clicks: 20 } }])),
    conversions: { google_ads_conversions: 10, booking_completed: 106, google_collected_at: now.toISOString(), ga4_collected_at: now.toISOString() },
  };
  snapshot.data_quality = evaluateShadowDataQuality(snapshot, { now });
  return snapshot;
}

test('actual bootstrap cycle coalesces refreshes, persists report and preserves completed data after read failure', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parma-cycle-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const historyFile = path.join(dir, 'history.json');
  const actualRequire = createRequire(path.join(root, 'bootstrap.js'));
  const pending = [deferred(), deferred(), deferred()];
  let calls = 0;
  const logs = [];
  const fakeExpress = () => ({ get() {}, post() {} });
  const cache = { express: { exports: fakeExpress } };
  const stubs = {
    './meta-paused-draft-next': { META_API_VERSION: 'test-only' },
    './full-live-shadow-data': { collectFullLiveShadowInput: () => pending[calls++].promise },
    './meta-runtime-preflight': { registerMetaRealPreflightRoute() {} },
    './meta-safe-create-route': { registerMetaSafeCreateRoute() {} },
    './meta-preflight-status': { state: {}, run: async () => {} },
    './server': {},
  };
  const isolatedRequire = name => name === 'express' ? cache.express.exports : Object.hasOwn(stubs, name) ? stubs[name] : actualRequire(name);
  isolatedRequire.resolve = name => name;
  isolatedRequire.cache = cache;
  const context = {
    require: isolatedRequire, module: { exports: {} },
    process: { env: { SHADOW_HISTORY_PATH: historyFile } },
    console: Object.fromEntries(['log', 'warn', 'error'].map(key => [key, text => logs.push(text)])),
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'bootstrap.js'), 'utf8') + '\nmodule.exports = { state, triggerShadowReport, buildRuntimeViews };', context);
  const runtime = context.module.exports;
  const first = runtime.triggerShadowReport();
  assert.equal(first, runtime.triggerShadowReport());
  assert.equal(calls, 1);
  pending[0].resolve(collectorFixture());
  await first;
  const completed = runtime.state.result;
  const views = runtime.buildRuntimeViews();
  assert.equal(views.summary.conversion_integrity.optimization_allowed, false);
  assert.equal(views.summary.decision_brief.priorities[0].code, 'RECONCILE_BUSINESS_OUTCOMES');
  assert.equal(views.cycle.stages.history.total_runs, 1);
  assert.equal(loadHistory(historyFile)[0].priority_codes[0], 'RECONCILE_BUSINESS_OUTCOMES');
  assert.equal(views.summary.writes_allowed, false);

  const failed = runtime.triggerShadowReport();
  pending[1].reject(new Error('sensitive-test-error-marker'));
  await assert.rejects(failed, /sensitive-test-error-marker/);
  assert.equal(runtime.state.result, completed);
  assert.equal(loadHistory(historyFile).length, 1);
  assert.equal(runtime.state.status, 'completed');
  assert.equal(runtime.buildRuntimeViews().summary.decision_brief.snapshot_status, 'last_refresh_failed');
  assert.equal(JSON.stringify(runtime.buildRuntimeViews()).includes('sensitive-test-error-marker'), false);
  assert.equal(logs.join('').includes('sensitive-test-error-marker'), false);

  const recovered = runtime.triggerShadowReport();
  pending[2].resolve(collectorFixture());
  await recovered;
  assert.equal(calls, 3);
  assert.equal(runtime.state.last_refresh_error, null);
  assert.equal(runtime.state.status, 'completed');
});

function schedulerHarness() {
  const logs = [], timers = [];
  const context = {
    require: () => ({}), module: { exports: {} }, process: { env: {} },
    setInterval(fn, interval) { timers.push({ fn, interval }); return { unref() {} }; },
    console: Object.fromEntries(['log', 'warn', 'error'].map(key => [key, text => logs.push(text)])),
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'scheduler-bootstrap.js'), 'utf8'), context);
  return { ...context.module.exports, logs, timers };
}
test('scheduler never overlaps requests or logs a key or arbitrary response/error body', async () => {
  const scheduler = schedulerHarness(), pending = deferred();
  let calls = 0;
  const env = { PARMA_AGENT_API_KEY: 'private-test-marker', SHADOW_REFRESH_INTERVAL_MINUTES: '1' };
  const client = { post: async (url, data, config) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:3000/tools/agent/shadow/refresh');
    assert.equal(data, null);
    assert.equal(config.headers['x-api-key'], env.PARMA_AGENT_API_KEY);
    return pending.promise;
  } };
  const runner = scheduler.startReadonlyShadowScheduler({ env, client });
  assert.equal(runner.intervalMinutes, 15);
  const first = runner.tick(); await runner.tick();
  assert.equal(calls, 1);
  pending.resolve({ status: 202, data: { status: 'private-test-marker' } });
  await first;
  client.post = async () => { throw new Error('private-test-marker'); };
  await runner.tick();
  assert.equal(scheduler.logs.join('').includes('private-test-marker'), false);
});
test('scheduler does not start without configured authentication and does not retry permission failures', async () => {
  const scheduler = schedulerHarness();
  assert.equal(scheduler.startReadonlyShadowScheduler({ env: {} }), null);
  assert.equal(scheduler.timers.length, 0);
  let calls = 0;
  const runner = scheduler.startReadonlyShadowScheduler({ env: { PARMA_AGENT_API_KEY: 'test-only' }, client: { post: async () => { calls++; return { status: 403, data: {} }; } } });
  await runner.tick();
  assert.equal(calls, 1);
  assert.equal(JSON.parse(scheduler.logs.at(-1)).success, false);
});
