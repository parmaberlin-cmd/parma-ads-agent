'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../google-ads-economic-budget-job');

const CAMPAIGN = '23853417314';
const BUDGET_RESOURCE = 'customers/7376153998/campaignBudgets/15580613718';
const ENV = { ADS_AUDIT_INTEGRITY_KEY: 'k'.repeat(48) };
const KEY = M.integrityKey(ENV);
const NOW = Date.parse('2026-09-18T18:30:00.000Z');
const EXECUTE = '2026-09-18T18:30:00.000Z';
const EXPIRES = '2026-09-18T22:30:00.000Z';

function plan(overrides = {}) {
  return {
    schema: 'google_ads.economic_budget_plan.v1',
    plan_id: 'parma-pizza-boost-20260918',
    customer_id: '7376153998',
    campaign_id: CAMPAIGN,
    budget_resource_name: BUDGET_RESOURCE,
    before_budget_micros: 4000000,
    target_budget_micros: 8000000,
    max_increment_micros: 4000000,
    max_budget_micros: 8000000,
    spend_allowed: true,
    ...overrides,
  };
}

function fixture(t, { micros = 4000000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'econ-job-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = { micros };
  const calls = [];
  const auditStore = { records: [], append(kind, payload) { this.records.push({ kind, payload }); return { id: `R_${this.records.length}` }; } };
  const nowRef = { value: NOW };
  const store = new M.EconomicJobStore({ directory: dir, integrityKey: KEY, now: () => nowRef.value });
  const customer = {
    query: async () => [{
      campaign: { id: CAMPAIGN, status: 2, campaign_budget: BUDGET_RESOURCE },
      campaign_budget: { resource_name: BUDGET_RESOURCE, amount_micros: state.micros },
    }],
  };
  const adapterFactory = () => ({
    mutateResources: async (operations, options) => {
      calls.push({ amount_micros: operations[0].resource.amount_micros, validate_only: options.validate_only });
      if (options.validate_only !== true) state.micros = operations[0].resource.amount_micros;
      return { provider_write: options.validate_only !== true };
    },
  });
  return { dir, state, calls, auditStore, nowRef, store, customer, adapterFactory };
}

function envelopeFor(planValue, { jobId = 'job-1', executeAt = EXECUTE, expiresAt = EXPIRES } = {}) {
  const built = M.buildEnvelope({ jobId, plan: planValue, nonce: `nonce-${jobId}`, executeAt, expiresAt, key: KEY, now: () => NOW });
  assert.equal(built.blockers, undefined);
  return built.envelope;
}

function run({ store, customer, auditStore, adapterFactory, nowRef, job, env = ENV }) {
  return M.processEconomicJob({
    entry: { job },
    store,
    env,
    now: () => nowRef.value,
    customer,
    auditStore,
    adapterFactory,
  });
}

test('authorization rejection without spend_allowed', () => {
  const built = M.buildEnvelope({ jobId: 'j1', plan: plan({ spend_allowed: false }), nonce: 'n1', executeAt: EXECUTE, expiresAt: EXPIRES, key: KEY, now: () => NOW });
  assert.deepEqual(built.blockers, ['plan_invalid']);
});

test('wrong campaign rejection', (t) => {
  const f = fixture(t);
  const envelope = envelopeFor(plan({ campaign_id: '23276824770' }), { jobId: 'j2' });
  assert.throws(() => f.store.submit(envelope), /economic_campaign_not_allowlisted/);
});

test('target above 8.00 EUR/day rejection', () => {
  const envelope = envelopeFor(plan({ target_budget_micros: 8500000, max_budget_micros: 8500000 }), { jobId: 'j3' });
  const check = M.validateEconomicJob(envelope, { now: () => NOW, key: KEY });
  assert.equal(check.ok, false);
  assert.ok(check.blockers.includes('economic_authority_budget_exceeded'));
});

test('increment above +4.00 EUR rejection (authority and plan cap)', () => {
  const overAuthority = envelopeFor(plan({ max_increment_micros: 5000000 }), { jobId: 'j4' });
  const first = M.validateEconomicJob(overAuthority, { now: () => NOW, key: KEY });
  assert.equal(first.ok, false);
  assert.ok(first.blockers.includes('economic_authority_increment_exceeded'));
  const overPlan = envelopeFor(plan({ max_increment_micros: 1000000 }), { jobId: 'j5' });
  const second = M.validateEconomicJob(overPlan, { now: () => NOW, key: KEY });
  assert.equal(second.ok, false);
  assert.ok(second.blockers.includes('economic_increment_exceeds_plan_cap'));
});

test('correct 4.00 -> 8.00 accepted, executed and verified by read-back', async (t) => {
  const f = fixture(t);
  const job = envelopeFor(plan(), { jobId: 'boost' });
  f.store.submit(job);
  const result = await run({ ...f, job });
  assert.equal(result.result, 'DONE');
  assert.equal(result.state, 'VERIFIED_COMPLETE');
  assert.equal(result.writes_executed, 1);
  assert.equal(f.state.micros, 8000000);
  assert.deepEqual(f.calls.map(call => call.validate_only), [true, false]);
  const stored = f.store.readResult('boost');
  assert.equal(stored.before_budget_micros, 4000000);
  assert.equal(stored.after_budget_micros, 8000000);
  assert.ok(f.auditStore.records.some(record => record.payload.event === 'economic_job_provider_write_pending'));
  assert.ok(f.auditStore.records.some(record => record.kind === 'change' && record.payload.after_budget_micros === 8000000));
});

test('durable scheduled 8.00 -> 4.00 revert waits for execute_at and then runs', async (t) => {
  const f = fixture(t, { micros: 8000000 });
  const job = envelopeFor(plan({ plan_id: 'parma-pizza-revert-20260918', before_budget_micros: 8000000, target_budget_micros: 4000000, max_increment_micros: 0 }), {
    jobId: 'revert', executeAt: '2026-09-18T21:00:00.000Z',
  });
  f.store.submit(job);
  const early = await run({ ...f, job });
  assert.equal(early.result, 'NOT_DUE');
  assert.equal(f.state.micros, 8000000);
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.readState('revert').state, 'SCHEDULED');
  f.nowRef.value = Date.parse('2026-09-18T21:00:01.000Z');
  const due = await run({ ...f, job });
  assert.equal(due.result, 'DONE');
  assert.equal(f.state.micros, 4000000);
});

test('scheduled revert survives a store reload (worker/service restart)', async (t) => {
  const f = fixture(t, { micros: 8000000 });
  f.store.submit(envelopeFor(plan({ plan_id: 'revert-reload', before_budget_micros: 8000000, target_budget_micros: 4000000, max_increment_micros: 0 }), {
    jobId: 'revert-reload', executeAt: '2026-09-18T21:00:00.000Z',
  }));
  const reloaded = new M.EconomicJobStore({ directory: f.dir, integrityKey: KEY, now: () => f.nowRef.value });
  const incoming = reloaded.listIncoming();
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].job.job_id, 'revert-reload');
  const early = await run({ ...f, store: reloaded, job: incoming[0].job });
  assert.equal(early.result, 'NOT_DUE');
  assert.equal(f.state.micros, 8000000);
  f.nowRef.value = Date.parse('2026-09-18T21:00:01.000Z');
  const afterRestart = new M.EconomicJobStore({ directory: f.dir, integrityKey: KEY, now: () => f.nowRef.value });
  const due = await run({ ...f, store: afterRestart, job: afterRestart.listIncoming()[0].job });
  assert.equal(due.result, 'DONE');
  assert.equal(f.state.micros, 4000000);
});

test('read-back mismatch is never silently accepted', async (t) => {
  const f = fixture(t);
  const adapterFactory = () => ({
    mutateResources: async (operations, options) => {
      f.calls.push({ validate_only: options.validate_only });
      return { provider_write: options.validate_only !== true };
    },
  });
  const job = envelopeFor(plan(), { jobId: 'mismatch' });
  f.store.submit(job);
  const result = await run({ ...f, job, adapterFactory });
  assert.equal(result.result, 'NEEDS_HUMAN');
  assert.equal(result.state, 'RECONCILIATION_REQUIRED');
  assert.ok(result.blockers.includes('economic_readback_mismatch'));
});

test('ambiguous provider write is reconciled read-only, never retried blindly', async (t) => {
  const f = fixture(t);
  const adapterFactory = () => ({
    mutateResources: async (operations, options) => {
      f.calls.push({ validate_only: options.validate_only });
      if (options.validate_only === false) throw new Error('provider_transport_ambiguous');
      return { provider_write: false };
    },
  });
  const job = envelopeFor(plan(), { jobId: 'ambiguous' });
  f.store.submit(job);
  const first = await run({ ...f, job, adapterFactory });
  assert.equal(first.result, 'NEEDS_HUMAN');
  assert.equal(first.state, 'AMBIGUOUS');
  assert.equal(f.store.readState('ambiguous').state, 'PROVIDER_WRITE_PENDING');
  const callCount = f.calls.length;
  const second = await run({ ...f, job, adapterFactory });
  assert.equal(f.calls.length, callCount);
  assert.equal(second.result, 'FAILED_SAFE');
  assert.ok(second.blockers.includes('economic_write_not_applied'));
});

test('tampered queued job is rejected by the store', (t) => {
  const f = fixture(t);
  f.store.submit(envelopeFor(plan(), { jobId: 'tamper' }));
  const file = path.join(f.dir, 'incoming', 'tamper.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const payload = JSON.parse(raw.payload);
  payload.plan.target_budget_micros = 8000001;
  raw.payload = JSON.stringify(payload);
  fs.writeFileSync(file, JSON.stringify(raw));
  assert.throws(() => f.store.unseal(file), /economic_job_store_integrity_failed/);
});
