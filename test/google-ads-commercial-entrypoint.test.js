'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planDigest, runCommercialOneShot } = require('../google-ads-commercial-runner');

const CUSTOMER_ID = '7376153998';
const CAMPAIGN_ID = '23276824770';
const CAMPAIGN_RESOURCE = `customers/${CUSTOMER_ID}/campaigns/${CAMPAIGN_ID}`;

function plan(overrides = {}) {
  return {
    schema: 'google_ads.commercial_plan.v1',
    plan_id: 'approved-plan-20260913',
    customer_id: CUSTOMER_ID,
    spend_allowed: false,
    actions: [{
      action: { type: 'negative_add', campaign_id: CAMPAIGN_ID, campaign_resource_name: CAMPAIGN_RESOURCE, text: 'synthetic intent', match_type: 'PHRASE' },
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
  assert.deepEqual(result.replay_state, { replayable: true, reason: 'commercial_plan_new' });
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

test('legacy reservation is retryable only when durable order proves preflight never completed', async () => {
  let writes = 0;
  const value = plan();
  const store = memoryStore([{ kind: 'audit', payload: { event: 'commercial_plan_execution_started', plan_digest: planDigest(value) } }]);
  const provider = customer({
    query: async () => writes ? [{ campaign_criterion: { keyword: { text: 'synthetic intent', match_type: 'PHRASE' } } }] : [],
    mutateResources: async (_operations, options) => { if (!options.validate_only) writes += 1; return { results: [] }; },
  });
  const result = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: provider, store });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(writes, 1);
});

test('legacy reservation with a completed snapshot remains ambiguous and non-replayable', async () => {
  let writes = 0;
  const value = plan();
  const store = memoryStore([
    { id: 'R_1', kind: 'audit', payload: { event: 'commercial_plan_execution_started', plan_digest: planDigest(value) } },
    { id: 'R_2', kind: 'state', payload: { schema: 'google_ads.controlled_state.v1' } },
  ]);
  const result = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: customer({ mutateResources: async () => { writes += 1; } }), store });
  assert.deepEqual(result.blockers, ['commercial_plan_replay_blocked:commercial_plan_legacy_state_ambiguous']);
  assert.equal(writes, 0);
});

test('failure before provider boundary records zero-write and permits one safe retry', async () => {
  const value = plan();
  const store = memoryStore();
  let failRead = true;
  let writes = 0;
  const provider = customer({
    query: async () => {
      if (failRead) throw new Error('snapshot_unavailable');
      return writes ? [{ campaign_criterion: { keyword: { text: 'synthetic intent', match_type: 'PHRASE' } } }] : [];
    },
    mutateResources: async (_operations, options) => { if (!options.validate_only) writes += 1; return { results: [] }; },
  });
  const first = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: provider, store });
  assert.deepEqual(first.blockers, ['snapshot_unavailable']);
  assert.equal(store.records.at(-1).payload.event, 'commercial_plan_failed_zero_write');
  assert.equal(writes, 0);
  failRead = false;
  const retry = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: provider, store });
  assert.equal(retry.status, 'VERIFIED');
  assert.equal(writes, 1);
});

test('provider boundary marker makes failed or ambiguous execution non-replayable', async () => {
  const value = plan();
  const store = memoryStore();
  let actualCalls = 0;
  const provider = customer({
    query: async () => [],
    mutateResources: async (_operations, options) => {
      if (options.validate_only) return { results: [] };
      actualCalls += 1;
      throw new Error('provider_transport_ambiguous');
    },
  });
  const first = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: provider, store });
  assert.deepEqual(first.blockers, ['provider_transport_ambiguous']);
  assert.equal(store.records.at(-1).payload.event, 'commercial_plan_failed_ambiguous');
  const retry = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: provider, store });
  assert.deepEqual(retry.blockers, ['commercial_plan_replay_blocked:commercial_plan_provider_state_ambiguous']);
  assert.equal(actualCalls, 1);
});

test('completed plan remains non-replayable and cannot execute twice', async () => {
  const value = plan();
  const store = memoryStore();
  let writes = 0;
  const provider = customer({
    query: async () => writes ? [{ campaign_criterion: { keyword: { text: 'synthetic intent', match_type: 'PHRASE' } } }] : [],
    mutateResources: async (_operations, options) => { if (!options.validate_only) writes += 1; return { results: [] }; },
  });
  const first = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: provider, store });
  assert.equal(first.status, 'VERIFIED');
  const second = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: provider, store });
  assert.deepEqual(second.blockers, ['commercial_plan_replay_blocked:commercial_plan_completed']);
  assert.equal(writes, 1);
});

// Regression: campaign 23276824770 belongs to customer 7376153998. The compiled
// operation previously reused the campaign id as the customer id, producing
// customers/23276824770/campaigns/23276824770.
test('executed commercial plan targets the explicit customer-scoped campaign resource', async () => {
  const value = plan();
  value.actions.push({
    action: { type: 'schedule_create', campaign_id: CAMPAIGN_ID, campaign_resource_name: CAMPAIGN_RESOURCE, day_of_week: 'MONDAY', start_hour: 8, start_minute: 'ZERO', end_hour: 12, end_minute: 'ZERO' },
    readback: { kind: 'AD_SCHEDULE', day_of_week: 'MONDAY', start_hour: 8, start_minute: 'ZERO', end_hour: 12, end_minute: 'ZERO' },
    before_state: { present: false, count: 0 },
    proposed_after_state: { present: true, count: 1, day_of_week: 'MONDAY', start_hour: 8, start_minute: 'ZERO', end_hour: 12, end_minute: 'ZERO' },
    change_id: 'commercial-change-2', objective_id: 'approved-commercial-plan',
    reason: 'Operator-approved bounded commercial change.',
    evidence: [{ type: 'operator_approval', reference: 'approved-plan-20260913' }], confidence: 1,
  });
  const calls = [];
  let negativeWritten = false;
  let scheduleWritten = false;
  const provider = customer({
    query: async sql => {
      if (sql.includes('ad_schedule')) {
        return scheduleWritten ? [{ campaign_criterion: { ad_schedule: { day_of_week: 'MONDAY', start_hour: 8, start_minute: 'ZERO', end_hour: 12, end_minute: 'ZERO' } } }] : [];
      }
      return negativeWritten ? [{ campaign_criterion: { keyword: { text: 'synthetic intent', match_type: 'PHRASE' } } }] : [];
    },
    mutateResources: async (operations, options) => {
      calls.push({ campaign: operations[0].resource.campaign, validate_only: options.validate_only });
      if (!options.validate_only) {
        if (operations[0].resource.ad_schedule) scheduleWritten = true;
        else negativeWritten = true;
      }
      return { results: [] };
    },
  });
  const result = await runCommercialOneShot({ mode: 'EXECUTE_APPROVED_PLAN', env: envFor(value), customer: provider, store: memoryStore() });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.writes_executed, 2);
  assert.deepEqual(calls, [
    { campaign: CAMPAIGN_RESOURCE, validate_only: true },
    { campaign: CAMPAIGN_RESOURCE, validate_only: false },
    { campaign: CAMPAIGN_RESOURCE, validate_only: true },
    { campaign: CAMPAIGN_RESOURCE, validate_only: false },
  ]);
  assert.ok(!JSON.stringify(calls).includes(`customers/${CAMPAIGN_ID}/campaigns/`));
});

test('commercial plans fail closed on missing, foreign or mismatched campaign resources', async () => {
  const missing = plan();
  delete missing.actions[0].action.campaign_resource_name;
  const missingResult = await runCommercialOneShot({ mode: 'DRY_RUN', env: envFor(missing), customer: customer(), store: memoryStore() });
  assert.deepEqual(missingResult.blockers, ['malformed_commercial_plan']);

  const foreignCampaign = plan();
  foreignCampaign.actions[0].action.campaign_resource_name = `customers/${CAMPAIGN_ID}/campaigns/${CAMPAIGN_ID}`;
  const foreignResult = await runCommercialOneShot({ mode: 'DRY_RUN', env: envFor(foreignCampaign), customer: customer(), store: memoryStore() });
  assert.deepEqual(foreignResult.blockers, ['plan_customer_mismatch']);

  const mismatchedCampaign = plan();
  mismatchedCampaign.actions[0].action.campaign_resource_name = `customers/${CUSTOMER_ID}/campaigns/99999999999`;
  const mismatchedResult = await runCommercialOneShot({ mode: 'DRY_RUN', env: envFor(mismatchedCampaign), customer: customer(), store: memoryStore() });
  assert.deepEqual(mismatchedResult.blockers, ['invalid_campaign_binding']);

  const wrongEntity = plan();
  wrongEntity.actions[0].action.campaign_resource_name = `customers/${CUSTOMER_ID}/adGroups/100`;
  const wrongEntityResult = await runCommercialOneShot({ mode: 'DRY_RUN', env: envFor(wrongEntity), customer: customer(), store: memoryStore() });
  assert.deepEqual(wrongEntityResult.blockers, ['malformed_commercial_plan']);
});
