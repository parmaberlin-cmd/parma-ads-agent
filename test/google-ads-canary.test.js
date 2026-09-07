'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const {
  CANARY,
  CanaryAuthorization,
  issueCanaryAuthorization,
  createCanaryReadAdapter,
  createCanaryMutationAdapter,
  buildCanaryMutationOperation,
  buildCanaryMutationRequest,
} = require('../google-ads-canary-core');
const { ControlledAdsStore } = require('../ads-controlled-execution-core');
const { validateOnlyCanary, executeCanary } = require('../google-ads-canary-runner');

const FIXED_NOW = Date.parse('2026-09-07T12:00:00.000Z');
const now = () => FIXED_NOW;
const FUTURE = new Date(FIXED_NOW + 60 * 60 * 1000).toISOString();
const RESOURCE = 'customers/7376153998/campaignCriteria/23276824770~1';
const INTEGRITY_KEY = '0123456789abcdef0123456789abcdef';

function makeStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'google-ads-canary-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new ControlledAdsStore({ directory, integrityKey: randomBytes(32), now });
}

function canaryEnv(overrides = {}) {
  return {
    ADS_AUDIT_INTEGRITY_KEY: INTEGRITY_KEY,
    GOOGLE_ADS_CANARY_ENABLED: 'true',
    GOOGLE_ADS_WRITE_KILL_SWITCH: 'false',
    GOOGLE_ADS_CANARY_KILL_SWITCH: 'false',
    GOOGLE_ADS_CANARY_EXPIRES_AT: FUTURE,
    ...overrides,
  };
}

function makeCustomer(t, { present = false } = {}) {
  let currentPresent = present;
  let calls = [];
  const customer = {
    credentials: { customer_id: CANARY.customer_id },
    getAccessToken: async () => 'test-token',
    callHeaders: { 'developer-token': 'test-token' },
    query: async query => {
      if (query.includes('campaign_criterion')) {
        return currentPresent
          ? [{ campaign_criterion: { resource_name: RESOURCE, keyword: { text: CANARY.keyword, match_type: 'EXACT' } } }]
          : [];
      }
      throw new Error('unexpected_query');
    },
  };
  const http = {
    request: async req => {
      calls.push(req);
      const operation = req.data.operations[0];
      if (operation.create) {
        if (req.data.validateOnly !== true) currentPresent = true;
        return { data: { results: [{ resourceName: RESOURCE }] } };
      }
      if (operation.remove) {
        if (req.data.validateOnly !== true) currentPresent = false;
        return { data: { results: [] } };
      }
      throw new Error('unexpected_mutation');
    },
  };
  return { customer, http, calls, isPresent: () => currentPresent };
}

function blockerNames(result) {
  return new Set(result.blockers || []);
}

test('canary write is disabled by default and never constructs a live mutation path', async () => {
  const result = await validateOnlyCanary({ env: {}, now });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.writes_executed, 0);
  assert.equal(result.provider_write, false);
  assert.ok(blockerNames(result).has('writes_disabled_by_default'));
});

test('missing audit integrity key blocks before any provider adapter is reached', async () => {
  const result = await validateOnlyCanary({ env: canaryEnv({ ADS_AUDIT_INTEGRITY_KEY: '' }), now });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(blockerNames(result).has('audit_integrity_key_unavailable'));
  assert.equal(result.real_google_ads_mutation_attempted, false);
});

test('unwritable audit path blocks closed', async t => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'canary-audit-file-')), 'audit.json');
  fs.writeFileSync(file, 'not-a-directory');
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  const result = await validateOnlyCanary({
    env: canaryEnv({ ADS_AUDIT_PATH: file }),
    now,
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(blockerNames(result).has('audit_storage_unavailable'));
});

test('expired authorization blocks the canary', async t => {
  const store = makeStore(t);
  const env = canaryEnv({ GOOGLE_ADS_CANARY_EXPIRES_AT: new Date(FIXED_NOW - 1000).toISOString() });
  const result = await validateOnlyCanary({ env, now, auditStore: store });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(blockerNames(result).has('authorization_unavailable'));
});

test('wrong campaign and wrong keyword are blocked by scoped authorization', async t => {
  const store = makeStore(t);
  const wrongCampaign = new CanaryAuthorization({
    authorization_id: 'canary-wrong-campaign',
    campaign_id: '99999999999',
    expires_at: FUTURE,
    issued_at: new Date(FIXED_NOW).toISOString(),
  });
  const campaignResult = await validateOnlyCanary({
    env: canaryEnv(),
    now,
    auditStore: store,
    authorization: wrongCampaign,
  });
  assert.ok(blockerNames(campaignResult).has('canary_campaign_mismatch'));

  const wrongKeyword = new CanaryAuthorization({
    authorization_id: 'canary-wrong-keyword',
    keyword: 'not-the-canary-keyword',
    expires_at: FUTURE,
    issued_at: new Date(FIXED_NOW).toISOString(),
  });
  const keywordResult = await validateOnlyCanary({
    env: canaryEnv(),
    now,
    auditStore: store,
    authorization: wrongKeyword,
  });
  assert.ok(blockerNames(keywordResult).has('canary_keyword_mismatch'));
});

test('single-use authorization blocks a second ADD use', () => {
  const auth = issueCanaryAuthorization({ now, expiresAt: FUTURE });
  const next = auth.consumeStep(CANARY.add_mutation_type, { now });
  assert.equal(next.used_steps.length, 1);
  assert.throws(
    () => next.consumeStep(CANARY.add_mutation_type, { now }),
    /authorization_already_used_for_mutation_type/,
  );
  assert.equal(next.max_financial_exposure_eur, 0);
  assert.equal(next.spend_changes_allowed, false);
});

test('arbitrary negative removal requires agent ownership metadata', () => {
  assert.throws(
    () => buildCanaryMutationOperation({
      mutation_type: CANARY.remove_mutation_type,
      resource_name: RESOURCE,
      ownership: {},
    }),
    /agent_ownership_required_for_removal/,
  );
  assert.throws(
    () => buildCanaryMutationOperation({
      mutation_type: CANARY.remove_mutation_type,
      resource_name: 'customers/9/campaignCriteria/1~2',
      ownership: { agent_created: true },
    }),
    /invalid_canary_resource_name/,
  );
});

test('non-EXACT and non-allowlisted mutation types are rejected', () => {
  assert.throws(
    () => buildCanaryMutationOperation({
      mutation_type: CANARY.add_mutation_type,
      match_type: 'PHRASE',
    }),
    /non_exact_negative_blocked/,
  );
  assert.throws(
    () => buildCanaryMutationOperation({ mutation_type: 'budget_change' }),
    /non_allowlisted_canary_mutation/,
  );
  assert.throws(
    () => buildCanaryMutationOperation({ mutation_type: 'conversion_action_change' }),
    /non_allowlisted_canary_mutation/,
  );
});

test('add and rollback mutation request shapes stay account/campaign/keyword bound', () => {
  const add = buildCanaryMutationRequest({ phase: 'ADD', expiresAt: FUTURE, now });
  assert.equal(add.campaign_id, CANARY.campaign_id);
  assert.equal(add.mutation_type, 'add_exact_negative_keyword');
  assert.equal(add.before_state.canary_exact_negative_present, false);
  assert.equal(add.proposed_after_state.canary_exact_negative_present, true);
  assert.equal(add.max_cost_eur, 0);

  const rollback = buildCanaryMutationRequest({ phase: 'REMOVE', resourceName: RESOURCE, expiresAt: FUTURE, now });
  assert.equal(rollback.mutation_type, 'remove_agent_created_negative_keyword');
  assert.deepEqual(rollback.object_identifiers, [RESOURCE]);
  assert.equal(rollback.before_state.canary_exact_negative_present, true);
  assert.equal(rollback.proposed_after_state.canary_exact_negative_present, false);
});

test('read-after-write verifies exact campaign negative presence and absence', async t => {
  const absent = makeCustomer(t, { present: false });
  const readerAbsent = createCanaryReadAdapter(absent.customer);
  assert.equal((await readerAbsent.readState()).canary_exact_negative_present, false);

  const present = makeCustomer(t, { present: true });
  const readerPresent = createCanaryReadAdapter(present.customer);
  const rows = await readerPresent.readExactNegative({});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].keyword, CANARY.keyword);
  assert.equal(rows[0].match_type, 'EXACT');
  assert.equal((await readerPresent.readState()).canary_exact_negative_present, true);
});

test('validate-only returns READY_FOR_CANARY without a real provider write', async t => {
  const f = makeCustomer(t, { present: false });
  const store = makeStore(t);
  const auth = issueCanaryAuthorization({ now, expiresAt: FUTURE });
  const result = await validateOnlyCanary({
    env: canaryEnv(),
    now,
    customer: f.customer,
    http: f.http,
    auditStore: store,
    authorization: auth,
  });
  assert.equal(result.status, 'READY_FOR_CANARY');
  assert.equal(result.writes_executed, 0);
  assert.equal(result.real_google_ads_mutation_attempted, false);
  assert.equal(f.calls.length, 0);
  assert.equal(store.verify().ok, true);
});

test('full canary execution adds, verifies, rolls back and leaves no synthetic negative', async t => {
  const f = makeCustomer(t, { present: false });
  const store = makeStore(t);
  const auth = issueCanaryAuthorization({ now, expiresAt: FUTURE });
  const result = await executeCanary({
    env: canaryEnv(),
    now,
    customer: f.customer,
    http: f.http,
    auditStore: store,
    authorization: auth,
  });
  assert.equal(result.status, 'CANARY_VERIFIED');
  assert.equal(result.writes_executed, 2);
  assert.equal(result.financial_exposure_eur, 0);
  assert.equal(f.isPresent(), false);
  assert.equal(f.calls.filter(call => call.data.validateOnly === false).length, 2);
  assert.equal(store.verify().ok, true);
  const phases = store.list('state').map(record => record.payload.phase);
  assert.ok(phases.includes('before_snapshot'));
  assert.ok(phases.includes('read_after_add'));
  assert.ok(phases.includes('final_verified_state'));
});

test('kill switch explicitly blocks canary even with writes enabled', async t => {
  const f = makeCustomer(t, { present: false });
  const store = makeStore(t);
  const result = await executeCanary({
    env: canaryEnv({ GOOGLE_ADS_CANARY_KILL_SWITCH: 'true' }),
    now,
    customer: f.customer,
    http: f.http,
    auditStore: store,
    authorization: issueCanaryAuthorization({ now, expiresAt: FUTURE }),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(blockerNames(result).has('canary_kill_switch_not_explicitly_permitted'));
  assert.equal(f.calls.length, 0);
});

test('emergency rollback runs when add verification fails and verifies absence', async t => {
  const store = makeStore(t);
  const auth = issueCanaryAuthorization({ now, expiresAt: FUTURE });
  const customer = {
    credentials: { customer_id: CANARY.customer_id },
    getAccessToken: async () => 'test-token',
    callHeaders: {},
    query: async () => [],
  };

  let actualPresent = false;
  let readCalls = 0;
  const mutationAdapter = {
    mutate: async (input, options) => {
      if (input.mutation_type === CANARY.add_mutation_type) {
        if (options.validate_only !== true) actualPresent = true;
        return { results: [{ resourceName: RESOURCE }] };
      }
      if (input.mutation_type === CANARY.remove_mutation_type) {
        if (options.validate_only !== true) actualPresent = false;
        return { results: [] };
      }
      throw new Error('unexpected_mutation');
    },
  };
  const readAdapter = {
    readExactNegative: async () => actualPresent ? [{ resource_name: RESOURCE }] : [],
    readState: async () => {
      const call = readCalls++;
      if (call <= 3) return { campaign_id: CANARY.campaign_id, canary_exact_negative_present: false };
      return { campaign_id: CANARY.campaign_id, canary_exact_negative_present: actualPresent };
    },
  };

  const result = await executeCanary({
    env: canaryEnv(),
    now,
    customer,
    auditStore: store,
    authorization: auth,
    readAdapter,
    mutationAdapter,
  });

  assert.equal(result.status, 'CANARY_ROLLED_BACK_AFTER_ADD_VERIFICATION_FAILURE');
  assert.equal(actualPresent, false);
  assert.equal(result.rollback_verified, true);
  assert.equal(store.verify().ok, true);
});

test('failed rollback verification returns CRITICAL_ROLLBACK_FAILURE and stops writes', async t => {
  const store = makeStore(t);
  const auth = issueCanaryAuthorization({ now, expiresAt: FUTURE });
  const customer = {
    credentials: { customer_id: CANARY.customer_id },
    getAccessToken: async () => 'test-token',
    callHeaders: {},
    query: async () => [],
  };

  let actualPresent = false;
  let readCalls = 0;
  const mutationAdapter = {
    mutate: async (input, options) => {
      if (input.mutation_type === CANARY.add_mutation_type) {
        if (options.validate_only !== true) actualPresent = true;
        return { results: [{ resourceName: RESOURCE }] };
      }
      if (input.mutation_type === CANARY.remove_mutation_type) {
        if (options.validate_only !== true) actualPresent = true; // rollback write does not remove
        return { results: [] };
      }
      throw new Error('unexpected_mutation');
    },
  };
  const readAdapter = {
    readExactNegative: async () => actualPresent ? [{ resource_name: RESOURCE }] : [],
    readState: async () => {
      const call = readCalls++;
      if (call <= 3) return { campaign_id: CANARY.campaign_id, canary_exact_negative_present: false };
      return { campaign_id: CANARY.campaign_id, canary_exact_negative_present: actualPresent };
    },
  };

  const result = await executeCanary({
    env: canaryEnv(),
    now,
    customer,
    auditStore: store,
    authorization: auth,
    readAdapter,
    mutationAdapter,
  });

  assert.equal(result.status, 'CRITICAL_ROLLBACK_FAILURE');
  assert.equal(result.resource_name, RESOURCE);
  assert.ok(result.blockers.includes('rollback_verification_failed'));
  assert.equal(store.verify().ok, true);
});

test('canary keyword cannot be substituted dynamically in the real adapter contract', async t => {
  const f = makeCustomer(t, { present: false });
  const adapter = createCanaryMutationAdapter(f.customer, { http: f.http });
  await assert.rejects(
    adapter.mutate({
      mutation_type: CANARY.add_mutation_type,
      keyword: 'another-keyword',
      match_type: 'EXACT',
    }, { validate_only: true }),
    /canary_keyword_mismatch/,
  );
});
