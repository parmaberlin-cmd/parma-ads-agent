'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planDigest, runCommercialOneShot } = require('../google-ads-commercial-runner');

const CUSTOMER_ID = '7376153998';

function plan(overrides = {}) {
  return {
    schema: 'google_ads.commercial_plan.v1',
    plan_id: 'approved-plan-20260913',
    customer_id: CUSTOMER_ID,
    spend_allowed: false,
    actions: [{
      action: { type: 'negative_add', campaign_id: '23276824770', text: 'synthetic intent', match_type: 'PHRASE' },
      readback: { kind: 'CAMPAIGN_NEGATIVE', text: 'synthetic intent', match_type: 'PHRASE' },
      before_state: { present: false, count: 0, text: 'synthetic intent', match_type: 'PHRASE' },
      proposed_after_state: { present: true, count: 1, text: 'synthetic intent', match_type: 'PHRASE' },
      change_id: 'commercial-change-1', objective_id: 'approved-commercial-plan',
      reason: 'Operator-approved bounded commercial change.',
      evidence: [{ type: 'operator_approval', reference: 'approved-plan-20260913' }], confidence: 1,
    }],
    ...overrides,
  };
}

function envFor(value = plan(), overrides = {}) {
  return {
    GOOGLE_CUSTOMER_ID: CUSTOMER_ID,
    GOOGLE_ADS_COMMERCIAL_PLAN_JSON: JSON.stringify(value),
    GOOGLE_ADS_COMMERCIAL_APPROVED_PLAN_SHA256: planDigest(value),
    GOOGLE_ADS_SPEND_ALLOWED: 'false',
    GOOGLE_ADS_WRITE_KILL_SWITCH: 'false',
    GOOGLE_ADS_COMMERCIAL_KILL_SWITCH: 'false',
    GOOGLE_ADS_COMMERCIAL_EXECUTION_AUTHORIZED: 'true',
    ...overrides,
  };
}

function memoryStore(records = []) {
  return {
    records,
    append(kind, payload) { const record = { id: `R_${this.records.length + 1}`, kind, payload }; this.records.push(record); return record; },
    list(kind) { return this.records.filter(record => !kind || record.kind === kind); },
    get(id) { return this.records.find(record => record.id === id) || null; },
  };
}

function customer({ query = async () => [], mutateResources = async () => ({ results: [] }) } = {}) {
  return { customerId: CUSTOMER_ID, query, mutateResources };
}

test('default startup is disabled and performs zero writes', async () => {
  delete require.cache[require.resolve('../google-ads-commercial-preload')];
  const { runStartupCommercial } = require('../google-ads-commercial-preload');
  let invoked = false;
  const result = await runStartupCommercial({ env: {}, log: () => {}, runner: async () => { invoked = true; } });
  assert.equal(result.status, 'DISABLED');
  assert.equal(result.writes_executed, 0);
  assert.equal(invoked, false);
});

test('missing execution authorization fails closed', async () => {
  let writes = 0;
  const result = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(plan(), { GOOGLE_ADS_COMMERCIAL_EXECUTION_AUTHORIZED: '' }), customer: customer({ mutateResources: async () => { writes += 1; } }), store: memoryStore() });
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.blockers, ['commercial_execution_not_authorized']);
  assert.equal(writes, 0);
});

test('malformed and unknown plans fail closed', async () => {
  const malformed = await runCommercialOneShot({ mode: 'DRY_RUN', env: envFor(plan(), { GOOGLE_ADS_COMMERCIAL_PLAN_JSON: '{' }), customer: customer(), store: memoryStore() });
  assert.deepEqual(malformed.blockers, ['malformed_commercial_plan']);
  const unknown = plan();
  unknown.actions[0].action.type = 'arbitrary_provider_call';
  const blocked = await runCommercialOneShot({ mode: 'DRY_RUN', env: { ...envFor(plan()), GOOGLE_ADS_COMMERCIAL_PLAN_JSON: JSON.stringify(unknown), GOOGLE_ADS_COMMERCIAL_APPROVED_PLAN_SHA256: planDigest(unknown) }, customer: customer(), store: memoryStore() });
  assert.deepEqual(blocked.blockers, ['malformed_commercial_plan']);
});

test('account mismatch fails closed before provider access', async () => {
  let reads = 0;
  const result = await runCommercialOneShot({ mode: 'DRY_RUN', env: envFor(plan(), { GOOGLE_CUSTOMER_ID: '9999999999' }), customer: customer({ query: async () => { reads += 1; return []; } }), store: memoryStore() });
  assert.deepEqual(result.blockers, ['commercial_customer_mismatch']);
  assert.equal(reads, 0);
});

test('SPEND_ALLOWED false is enforced and economic actions are rejected', async () => {
  const openGate = await runCommercialOneShot({ mode: 'DRY_RUN', env: envFor(plan(), { GOOGLE_ADS_SPEND_ALLOWED: 'true' }), customer: customer(), store: memoryStore() });
  assert.deepEqual(openGate.blockers, ['spend_gate_must_remain_closed']);
  const economic = plan();
  economic.actions[0].action = { type: 'campaign_budget_create', campaign_id: '0', resource_name: `customers/${CUSTOMER_ID}/campaignBudgets/-1`, name: 'Blocked', amount_micros: 1000000, explicitly_shared: false };
  economic.actions[0].readback = { kind: 'RESOURCE_STATUS', resource_name: `customers/${CUSTOMER_ID}/campaigns/23276824770` };
  const result = await runCommercialOneShot({ mode: 'DRY_RUN', env: envFor(economic), customer: customer(), store: memoryStore() });
  assert.deepEqual(result.blockers, ['spend_or_creation_action_blocked']);
});

test('eligible resource enablement keeps a separate explicit activation gate', async () => {
  const enabled = plan();
  enabled.actions[0].action = { type: 'rsa_update', campaign_id: '23276824770', resource_name: `customers/${CUSTOMER_ID}/adGroupAds/100~200`, status: 'ENABLED' };
  enabled.actions[0].readback = { kind: 'RESOURCE_STATUS', resource_name: `customers/${CUSTOMER_ID}/adGroupAds/100~200` };
  const result = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(enabled, { GOOGLE_ADS_COMMERCIAL_ACTIVATION_AUTHORIZED: '' }), customer: customer(), store: memoryStore() });
  assert.deepEqual(result.blockers, ['commercial_activation_not_authorized']);
});

test('authorized dry-run reaches operational control with provider read-back and durable audit dependency', async () => {
  let reads = 0;
  let writes = 0;
  const store = memoryStore();
  const result = await runCommercialOneShot({
    mode: 'DRY_RUN', env: envFor(), store,
    customer: customer({ query: async () => { reads += 1; return []; }, mutateResources: async () => { writes += 1; } }),
  });
  assert.equal(result.status, 'DRY_RUN_VERIFIED');
  assert.equal(result.provider_credentials_internal, true);
  assert.equal(result.provider_write, false);
  assert.equal(result.commercial_mutations, 0);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.equal(store.records.at(-1).payload.event, 'commercial_plan_dry_run_completed');
});

test('runner supplies provider, read-back, closed spend gates and audit to operational control', async () => {
  const store = memoryStore();
  let supplied = false;
  const result = await runCommercialOneShot({
    mode: 'DRY_RUN', env: envFor(), store, customer: customer(),
    readStateFactory: (provider, item) => { assert.equal(provider.customerId, CUSTOMER_ID); assert.equal(item.change_id, 'commercial-change-1'); return async () => item.before_state; },
    controlFactory: options => {
      supplied = options.store === store && typeof options.readState === 'function' && options.gates.spend_allowed === false && options.gates.economic_authorized === false;
      return { dryRun: async item => ({ status: 'SIMULATED_VERIFIED', provider_write: false, writes_executed: 0, item }) };
    },
  });
  assert.equal(supplied, true);
  assert.equal(result.status, 'DRY_RUN_VERIFIED');
});

test('startup runner is one-shot and clears process-local execution switches', async () => {
  delete require.cache[require.resolve('../google-ads-commercial-preload')];
  const { runStartupCommercial } = require('../google-ads-commercial-preload');
  const env = envFor();
  env.GOOGLE_ADS_COMMERCIAL_STARTUP_MODE = 'DRY_RUN';
  let calls = 0;
  const runner = async ({ env: scoped, mode }) => { calls += 1; assert.equal(mode, 'DRY_RUN'); assert.equal(scoped.GOOGLE_ADS_COMMERCIAL_EXECUTION_AUTHORIZED, 'true'); return { status: 'DRY_RUN_VERIFIED', mode, commercial_mutations: 0 }; };
  const first = await runStartupCommercial({ env, log: () => {}, runner });
  env.GOOGLE_ADS_COMMERCIAL_STARTUP_MODE = 'DRY_RUN';
  const second = await runStartupCommercial({ env, log: () => {}, runner });
  assert.equal(first.status, 'DRY_RUN_VERIFIED');
  assert.deepEqual(second.blockers, ['commercial_startup_already_consumed']);
  assert.equal(env.GOOGLE_ADS_COMMERCIAL_STARTUP_MODE, '');
  assert.equal(env.GOOGLE_ADS_COMMERCIAL_EXECUTION_AUTHORIZED, '');
  assert.equal(env.GOOGLE_ADS_COMMERCIAL_ACTIVATION_AUTHORIZED, '');
  assert.equal(calls, 1);
});

test('durable started record blocks duplicate or restart replay before transport', async () => {
  let writes = 0;
  const value = plan();
  const store = memoryStore([{ kind: 'audit', payload: { event: 'commercial_plan_execution_started', plan_digest: planDigest(value) } }]);
  const result = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: customer({ mutateResources: async () => { writes += 1; } }), store });
  assert.deepEqual(result.blockers, ['commercial_plan_replay_blocked']);
  assert.equal(writes, 0);
});
