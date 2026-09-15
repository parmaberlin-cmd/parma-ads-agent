'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { ControlledAdsStore } = require('../ads-controlled-execution-core');
const { compileOperation, buildMutationRequest, createOperationalGoogleAdsControl } = require('../google-ads-operational-control');

const now = () => Date.parse('2026-09-13T12:00:00.000Z');
const C = 'customers/7376153998/campaigns/23276824770';
const A = 'customers/7376153998/adGroups/100';

function store(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-operational-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new ControlledAdsStore({ directory, integrityKey: randomBytes(32), now });
}

function input(action, overrides = {}) {
  return {
    action,
    before_state: { version: 'before' },
    proposed_after_state: { version: 'after' },
    change_id: `change-${action.type}`,
    objective_id: 'operational-control-build',
    reason: 'Controlled technical operation with independent read-back.',
    evidence: [{ type: 'operator_plan', reference: 'build-next' }],
    ...overrides,
  };
}

// Provider-write transport double. The control always writes through a
// transport (the default is the bounded REST transport); fixtures inject this
// stub so tests stay offline while keeping the same single-operation contract.
function transport(onMutation = async () => ({ results: [] })) {
  return {
    mutateResources: async (operations, options) => {
      assert.equal(Array.isArray(operations) && operations.length, 1);
      assert.equal(typeof options.validate_only, 'boolean');
      assert.equal(options.partial_failure, false);
      return onMutation(operations, options);
    },
  };
}

test('compiler covers the required operational entities and keeps every create non-serving', () => {
  const actions = [
    { type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: C, text: 'gluten free', match_type: 'PHRASE' },
    { type: 'keyword_create', campaign_id: '23276824770', ad_group_resource_name: A, text: 'pizza dinner', match_type: 'EXACT', status: 'PAUSED' },
    { type: 'schedule_create', campaign_id: '23276824770', campaign_resource_name: C, day_of_week: 'THURSDAY', start_hour: 12, start_minute: 'ZERO', end_hour: 17, end_minute: 'ZERO' },
    { type: 'rsa_create', campaign_id: '23276824770', ad_group_resource_name: A, headlines: ['Dinner in Kreuzberg', 'Organic Pizza Berlin', 'Open From Five'], descriptions: ['Book a table for dinner in Kreuzberg.', 'Organic sourdough pizza made in Berlin.'], final_urls: ['https://example.com/'], status: 'PAUSED' },
    { type: 'ad_group_create', campaign_id: '23276824770', campaign_resource_name: C, name: 'Late Dinner draft', status: 'PAUSED' },
    { type: 'campaign_create', campaign_id: '0', resource_name: 'customers/7376153998/campaigns/-1', name: 'Technical paused draft', campaign_budget: 'customers/7376153998/campaignBudgets/1', advertising_channel_type: 'SEARCH', status: 'PAUSED' },
    { type: 'geo_add', campaign_id: '23276824770', campaign_resource_name: C, geo_target_constant: 'geoTargetConstants/2276', negative: false },
    { type: 'language_add', campaign_id: '23276824770', campaign_resource_name: C, language_constant: 'languageConstants/1000' },
  ];
  const operations = actions.map(compileOperation);
  assert.deepEqual(operations.map(value => value.entity), ['campaign_criterion', 'ad_group_criterion', 'campaign_criterion', 'ad_group_ad', 'ad_group', 'campaign', 'campaign_criterion', 'campaign_criterion']);
  assert.equal(operations[1].resource.status, 'PAUSED');
  assert.equal(operations[3].resource.status, 'PAUSED');
  assert.equal(operations[4].resource.status, 'PAUSED');
  assert.equal(operations[5].resource.status, 'PAUSED');
});

test('compiler supports controlled pause/enable and exact owned-resource removal', () => {
  const updates = [
    { type: 'keyword_update', campaign_id: '23276824770', resource_name: 'customers/7376153998/adGroupCriteria/100~200', status: 'PAUSED' },
    { type: 'rsa_update', campaign_id: '23276824770', resource_name: 'customers/7376153998/adGroupAds/100~300', status: 'ENABLED' },
    { type: 'ad_group_update', campaign_id: '23276824770', resource_name: A, status: 'PAUSED' },
    { type: 'campaign_update', campaign_id: '23276824770', resource_name: C, status: 'PAUSED' },
  ].map(compileOperation);
  assert.ok(updates.every(value => value.operation === 'update'));
  for (const [type, resource_name] of [
    ['negative_remove', 'customers/7376153998/campaignCriteria/23276824770~1'],
    ['keyword_remove', 'customers/7376153998/adGroupCriteria/100~2'],
    ['schedule_remove', 'customers/7376153998/campaignCriteria/23276824770~3'],
    ['rsa_remove', 'customers/7376153998/adGroupAds/100~4'],
    ['ad_group_remove', A], ['campaign_remove', C],
    ['geo_remove', 'customers/7376153998/campaignCriteria/23276824770~5'],
    ['language_remove', 'customers/7376153998/campaignCriteria/23276824770~6'],
  ]) assert.equal(compileOperation({ type, campaign_id: '23276824770', resource_name }).operation, 'remove');
});

test('operational mutations use the existing catalog and always produce a rollback plan', async t => {
  const action = { type: 'schedule_create', campaign_id: '23276824770', campaign_resource_name: C, day_of_week: 'THURSDAY', start_hour: 12, start_minute: 'ZERO', end_hour: 17, end_minute: 'ZERO' };
  const request = buildMutationRequest(input(action));
  assert.equal(request.mutation_type, 'create_ad_schedule');
  const control = createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '7376153998' }, providerTransport: transport(),
    readState: async (_mutation, { phase }) => ({ version: phase === 'before' ? 'before' : 'after' }), now,
  });
  const result = await control.dryRun(input(action));
  assert.equal(result.status, 'SIMULATED_VERIFIED');
  assert.equal(result.provider_write, false);
  assert.equal(result.rollback.status, 'ROLLBACK_VERIFIED');
});

test('execution is fail-closed unless both write and execution gates are trusted', async t => {
  const action = { type: 'keyword_create', campaign_id: '23276824770', ad_group_resource_name: A, text: 'pizza dinner', match_type: 'EXACT', status: 'PAUSED' };
  for (const gates of [{}, { writes_allowed: true }]) {
    let calls = 0;
    const control = createOperationalGoogleAdsControl({ store: store(t), customer: { customerId: '7376153998' }, providerTransport: transport(async () => { calls += 1; }), readState: async () => ({ version: 'before' }), gates, now });
    const result = await control.execute(input(action));
    assert.equal(result.status, 'BLOCKED');
    assert.equal(calls, 0);
  }
});

test('campaign activation needs its separate authorization and spend remains denied', async t => {
  const action = { type: 'campaign_update', campaign_id: '23276824770', resource_name: C, status: 'ENABLED' };
  let calls = 0;
  const control = createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '7376153998' }, providerTransport: transport(async () => { calls += 1; }), readState: async () => ({ version: 'before' }),
    gates: { writes_allowed: true, execution_authorized: true, spend_allowed: false, activation_authorized: false }, now,
  });
  const result = await control.execute(input(action));
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.blockers, ['activation_authorization_required']);
  assert.equal(calls, 0);
  assert.equal(control.status().spend_allowed, false);
});

test('campaign budget creation exists but is blocked while spend authorization is false', async t => {
  const action = { type: 'campaign_budget_create', campaign_id: '0', resource_name: 'customers/7376153998/campaignBudgets/-1', name: 'Paused draft budget', amount_micros: 1000000, explicitly_shared: false };
  const operation = compileOperation(action);
  assert.equal(operation.entity, 'campaign_budget');
  assert.equal(operation.resource.explicitly_shared, false);
  let calls = 0;
  const control = createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '7376153998' }, providerTransport: transport(async () => { calls += 1; }), readState: async () => ({ version: 'before' }),
    gates: { writes_allowed: true, execution_authorized: true, spend_allowed: false, economic_authorized: false }, now,
  });
  const result = await control.execute(input(action));
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.blockers, ['spend_authorization_required']);
  assert.equal(calls, 0);
});

test('mock execution validates first, writes once, reads independently, verifies and audits', async t => {
  const calls = [];
  const phases = [];
  const audit = store(t);
  const action = { type: 'keyword_update', campaign_id: '23276824770', resource_name: 'customers/7376153998/adGroupCriteria/100~200', status: 'PAUSED' };
  const control = createOperationalGoogleAdsControl({
    store: audit,
    customer: { customerId: '7376153998' },
    providerTransport: transport((ops, options) => { calls.push({ ops, options }); return { results: [], http_status: 200, provider_write: options.validate_only !== true }; }),
    readState: async (_mutation, { phase }) => { phases.push(phase); return { version: phase === 'before' ? 'before' : 'after' }; }, sleep: async () => {},
    gates: { writes_allowed: true, execution_authorized: true, spend_allowed: false, activation_authorized: false }, now,
  });
  const result = await control.execute(input(action));
  assert.equal(result.status, 'VERIFIED');
  assert.deepEqual(calls.map(value => value.options.validate_only), [true, false]);
  assert.deepEqual(phases, ['before', 'after']);
  assert.equal(audit.last('change').payload.status, 'VERIFIED');
  assert.equal(audit.last('audit').payload.event, 'live_mutation');
});

test('read-back mismatch fails reconciliation closed', async t => {
  const action = { type: 'ad_group_update', campaign_id: '23276824770', resource_name: A, status: 'PAUSED' };
  const control = createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '7376153998' }, providerTransport: transport(),
    readState: async (_mutation, { phase }) => ({ version: phase === 'before' ? 'before' : 'unexpected' }),
    gates: { writes_allowed: true, execution_authorized: true }, now, sleep: async () => {}, readBackAttempts: 2,
  });
  const result = await control.execute(input(action));
  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.equal(result.accepted, false);
});

test('independent read-back uses bounded retry and stops when normalized state matches', async t => {
  const action = { type: 'keyword_update', campaign_id: '23276824770', resource_name: 'customers/7376153998/adGroupCriteria/100~200', status: 'PAUSED' };
  let afterReads = 0;
  const control = createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '7376153998' }, providerTransport: transport(),
    readState: async (_mutation, { phase }) => {
      if (phase === 'before') return { version: 'before' };
      afterReads += 1;
      return { version: afterReads < 3 ? 'eventually-consistent' : 'after' };
    },
    gates: { writes_allowed: true, execution_authorized: true }, now, sleep: async () => {}, readBackAttempts: 5,
  });
  const result = await control.execute(input(action));
  assert.equal(result.status, 'VERIFIED');
  assert.equal(afterReads, 3);
});

test('schemas reject serving creates, cross-customer resources and budget mutations', () => {
  assert.throws(() => compileOperation({ type: 'keyword_create', campaign_id: '23276824770', ad_group_resource_name: A, text: 'x', match_type: 'EXACT', status: 'ENABLED' }));
  assert.throws(() => compileOperation({ type: 'campaign_create', campaign_id: '0', resource_name: 'customers/9/campaigns/-1', name: 'x', campaign_budget: 'customers/7376153998/campaignBudgets/1', advertising_channel_type: 'SEARCH', status: 'PAUSED' }));
  assert.throws(() => compileOperation({ type: 'budget_update', campaign_id: '23276824770', amount_micros: 1 }));
});

test('trusted provider customer binding blocks a foreign operation before transport', async t => {
  let calls = 0;
  const action = { type: 'ad_group_update', campaign_id: '23276824770', resource_name: A, status: 'PAUSED' };
  const control = createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '9999999999' }, providerTransport: transport(async () => { calls += 1; }), readState: async () => ({ version: 'before' }),
    gates: { writes_allowed: true, execution_authorized: true }, now,
  });
  const result = await control.execute(input(action));
  assert.deepEqual(result.blockers, ['mutation_customer_mismatch']);
  assert.equal(calls, 0);
});

// Regression: campaign 23276824770 belongs to customer 7376153998. Building the
// campaign resource from campaign_id alone produced
// customers/23276824770/campaigns/23276824770, which blocked live validate-only.
const CAMPAIGN_RESOURCE = 'customers/7376153998/campaigns/23276824770';

test('campaign-scoped creates bind the explicit customer-scoped campaign resource', () => {
  const negative = compileOperation({ type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, text: 'gluten free', match_type: 'PHRASE' });
  assert.equal(negative.entity, 'campaign_criterion');
  assert.equal(negative.resource.campaign, CAMPAIGN_RESOURCE);
  assert.equal(negative.resource.negative, true);
  const schedule = compileOperation({ type: 'schedule_create', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, day_of_week: 'THURSDAY', start_hour: 12, start_minute: 'ZERO', end_hour: 17, end_minute: 'ZERO' });
  assert.equal(schedule.entity, 'campaign_criterion');
  assert.equal(schedule.resource.campaign, CAMPAIGN_RESOURCE);
  for (const operation of [negative, schedule]) {
    assert.notEqual(operation.resource.campaign, 'customers/23276824770/campaigns/23276824770');
    assert.match(operation.resource.campaign, /^customers\/7376153998\/campaigns\/23276824770$/);
  }
});

test('campaign resource bindings fail closed on customer or campaign mismatch', async t => {
  const negative = { type: 'negative_add', campaign_id: '23276824770', text: 'gluten free', match_type: 'PHRASE' };
  const schedule = { type: 'schedule_create', campaign_id: '23276824770', day_of_week: 'MONDAY', start_hour: 8, start_minute: 'ZERO', end_hour: 12, end_minute: 'ZERO' };
  for (const action of [negative, schedule]) {
    assert.throws(() => compileOperation(action), /Required|invalid_union|invalid_type/);
    assert.throws(() => compileOperation({ ...action, campaign_resource_name: 'customers/7376153998/campaigns/99999999999' }), /campaign_resource_campaign_mismatch/);
    assert.throws(() => compileOperation({ ...action, campaign_resource_name: 'customers/9999999999/campaigns/99999999999' }), /campaign_resource_campaign_mismatch/);
    assert.throws(() => compileOperation({ ...action, campaign_resource_name: A }), /invalid_union|invalid_string|Required/);
  }
  // The campaign id can never be promoted into the customer id namespace.
  const smuggled = compileOperation({ ...negative, campaign_resource_name: 'customers/23276824770/campaigns/23276824770' });
  assert.equal(smuggled.resource.campaign, 'customers/23276824770/campaigns/23276824770');
  let calls = 0;
  const control = createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '7376153998' }, providerTransport: transport(async () => { calls += 1; }), readState: async () => ({ version: 'before' }),
    gates: { writes_allowed: true, execution_authorized: true }, now,
  });
  const blocked = await control.execute(input({ ...negative, campaign_resource_name: 'customers/23276824770/campaigns/23276824770' }));
  assert.deepEqual(blocked.blockers, ['mutation_customer_mismatch']);
  assert.equal(calls, 0);
  assert.equal(blocked.provider_write, false);
});

test('negative_add and schedule_create reach the provider with the explicit campaign resource', async t => {
  const calls = [];
  const control = createOperationalGoogleAdsControl({
    store: store(t),
    customer: { customerId: '7376153998' },
    providerTransport: transport((ops, options) => { calls.push({ ops, options }); return { results: [] }; }),
    readState: async (_mutation, { phase }) => ({ version: phase === 'before' ? 'before' : 'after' }), sleep: async () => {},
    gates: { writes_allowed: true, execution_authorized: true, spend_allowed: false, activation_authorized: false }, now,
  });
  const negative = await control.execute(input({ type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, text: 'gluten free', match_type: 'PHRASE' }));
  const schedule = await control.execute(input({ type: 'schedule_create', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, day_of_week: 'MONDAY', start_hour: 8, start_minute: 'ZERO', end_hour: 12, end_minute: 'ZERO' }));
  assert.equal(negative.status, 'VERIFIED');
  assert.equal(schedule.status, 'VERIFIED');
  assert.deepEqual(calls.map(call => [call.options.validate_only, call.ops[0].resource.campaign]), [
    [true, CAMPAIGN_RESOURCE], [false, CAMPAIGN_RESOURCE],
    [true, CAMPAIGN_RESOURCE], [false, CAMPAIGN_RESOURCE],
  ]);
});

test('provider writes use the bounded transport and never the client gRPC mutateResources path', async t => {
  const calls = [];
  let grpcCalls = 0;
  const audit = store(t);
  const control = createOperationalGoogleAdsControl({
    store: audit,
    customer: { customerId: '7376153998', mutateResources: async () => { grpcCalls += 1; return { results: [] }; } },
    providerTransport: transport((operations, options) => {
      calls.push({ operation: operations[0], validate_only: options.validate_only });
      return { results: [], http_status: 200, provider_write: options.validate_only !== true, request_id: 'req-1' };
    }),
    readState: async (_mutation, { phase }) => ({ version: phase === 'before' ? 'before' : 'after' }), sleep: async () => {},
    gates: { writes_allowed: true, execution_authorized: true, spend_allowed: false, activation_authorized: false }, now,
  });
  const result = await control.execute(input({ type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, text: 'gluten free', match_type: 'PHRASE' }));
  assert.equal(result.status, 'VERIFIED');
  assert.equal(grpcCalls, 0);
  assert.deepEqual(calls.map(call => call.validate_only), [true, false]);
  assert.deepEqual(calls.map(call => call.operation.resource.campaign), [CAMPAIGN_RESOURCE, CAMPAIGN_RESOURCE]);
  const evidence = audit.list('audit').map(record => record.payload).filter(payload => String(payload.event || '').startsWith('operational_provider_'));
  assert.deepEqual(evidence.map(payload => [payload.event, payload.provider_write, payload.writes_executed, payload.http_status]), [
    ['operational_provider_validate_only', false, 0, 200],
    ['operational_provider_write', true, 1, 200],
  ]);
  assert.deepEqual(evidence.map(payload => payload.request_id), ['req-1', 'req-1']);
});

test('control construction fails closed without a REST-capable customer or an injected transport', async t => {
  assert.throws(() => createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '7376153998', query: async () => [] },
    readState: async () => ({ version: 'before' }), now,
  }), /invalid_operational_rest_transport/);
  assert.throws(() => createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '7376153998' }, providerTransport: {},
    readState: async () => ({ version: 'before' }), now,
  }), /operational_provider_transport_required/);
});

test('transport claiming a write during validation aborts before the real write is attempted', async t => {
  let calls = 0;
  const control = createOperationalGoogleAdsControl({
    store: store(t), customer: { customerId: '7376153998' },
    providerTransport: transport(() => { calls += 1; return { results: [], provider_write: true }; }),
    readState: async () => ({ version: 'before' }),
    gates: { writes_allowed: true, execution_authorized: true }, now,
  });
  await assert.rejects(
    () => control.execute(input({ type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, text: 'gluten free', match_type: 'PHRASE' })),
    /operational_validation_transport_mismatch/);
  assert.equal(calls, 1);
});
