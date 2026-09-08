'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const {
  META_DOMAINS,
  POLICY_CLASSES,
  classifyMetaMutationType,
  validateMetaMutationRequest,
  createDomainAuthorization,
  canAuthorizeDomain,
  buildMetaAccountRestrictionStatus,
  buildMetaAdsProductionReadiness,
} = require('../meta-execution-domains');
const {
  createMetaAdsMutationGateway,
  buildMetaRollbackPlan,
} = require('../meta-ads-controlled-gateway');
const {
  normalizeMetaSpendPolicy,
  createMetaSpendAuthorization,
  assertMetaSpendAuthorization,
  spendReadiness,
} = require('../meta-ads-spend-control');
const {
  createMetaExperiment,
  assertMetaExperimentBudget,
  transitionMetaExperiment,
  strongerBusinessOutcome,
  serendipityExperimentBlocked,
} = require('../meta-ads-experiment-engine');
const {
  buildInstagramCanaryAuthorization,
  validateOnlyInstagramCanary,
  executeInstagramCanary,
  contentPolicyPreflight,
} = require('../instagram-organic-canary');
const {
  CONTENT_AUTONOMY_DEFAULT,
  selectHistoricalCandidate,
  buildInstagramPublicationProposal,
  staleContentMarkers,
} = require('../instagram-content-autonomy');
const { ControlledAdsStore } = require('../ads-controlled-execution-core');

const FIXED_NOW = Date.parse('2026-09-08T12:00:00.000Z');
const now = () => FIXED_NOW;
const FUTURE = new Date(FIXED_NOW + 60 * 60 * 1000).toISOString();
const AUDIT_KEY = '0123456789abcdef0123456789abcdef';

function makeStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-canary-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new ControlledAdsStore({ directory, integrityKey: randomBytes(32), now });
}

function metaMutation(overrides = {}) {
  return {
    change_id: 'chg-meta-1',
    domain: META_DOMAINS.ADS_EXECUTION,
    mutation_type: 'PAUSE_AD',
    ad_account_id: 'act_123',
    object_identifiers: ['ad_1'],
    before_state: { status: 'ACTIVE' },
    proposed_after_state: { status: 'PAUSED' },
    reason: 'Test reversible Meta mutation',
    evidence: [{ type: 'test', reference: 'unit-test' }],
    confidence: 1,
    risk_class: 'LOW',
    approval_class: POLICY_CLASSES.A_AUTONOMOUS_LOW_RISK,
    max_cost_eur: 0,
    ...overrides,
  };
}

function makeKillSwitch(blocked = false, reasons = ['kill_switch_active']) {
  return { isBlocked: () => ({ blocked, reasons: blocked ? reasons : [] }) };
}

function spendControl(policy = {}, authorization = null) {
  return {
    assert: (mutation, { now: nowFn }) => assertMetaSpendAuthorization({
      policy: normalizeMetaSpendPolicy(policy),
      authorization,
      mutation,
      now: nowFn,
    }),
  };
}

test('Meta organic and ads domains do not share authorization', () => {
  const organic = createDomainAuthorization({
    domain: META_DOMAINS.ORGANIC_PUBLISHING,
    scope: 'instagram_publication',
    authorizationId: 'org-1',
    expiresAt: FUTURE,
    now,
  });
  const ads = createDomainAuthorization({
    domain: META_DOMAINS.ADS_EXECUTION,
    scope: 'pause_ad',
    authorizationId: 'ads-1',
    expiresAt: FUTURE,
    now,
  });
  assert.equal(canAuthorizeDomain(organic, META_DOMAINS.ORGANIC_PUBLISHING, { now }).allowed, true);
  assert.equal(canAuthorizeDomain(organic, META_DOMAINS.ADS_EXECUTION, { now }).allowed, false);
  assert.equal(canAuthorizeDomain(ads, META_DOMAINS.ADS_EXECUTION, { now }).allowed, true);
  assert.equal(canAuthorizeDomain(ads, META_DOMAINS.ORGANIC_PUBLISHING, { now }).allowed, false);
});

test('Meta mutation classes map low-risk, operator, and protected correctly', () => {
  assert.equal(classifyMetaMutationType('PAUSE_AD').policy_class, POLICY_CLASSES.A_AUTONOMOUS_LOW_RISK);
  assert.equal(classifyMetaMutationType('BUDGET_CHANGE').approval_required, true);
  assert.equal(classifyMetaMutationType('BILLING_CHANGE').protected, true);
  assert.equal(classifyMetaMutationType('UNKNOWN').valid, false);
});

test('Meta mutation request validation requires a Meta Ads domain', () => {
  assert.equal(validateMetaMutationRequest(metaMutation()).ok, true);
  const wrongDomain = validateMetaMutationRequest(metaMutation({ domain: META_DOMAINS.ORGANIC_PUBLISHING }));
  assert.equal(wrongDomain.ok, false);
  assert.ok(wrongDomain.errors.includes('invalid_execution_domain'));
});

test('Meta account restriction blocks writes and returns META_ADS_BLOCKED_EXTERNAL', async t => {
  const store = makeStore(t);
  const restriction = buildMetaAccountRestrictionStatus({
    overview: { campaign_counts: { with_issues: 5 } },
    issueReport: { issue_categories: { account_or_billing: 1 }, issue_reasons: { account_security_or_payment_restriction: 1 }, affected_objects: 15 },
  });
  assert.equal(restriction.blocking, true);
  const readiness = buildMetaAdsProductionReadiness({ restrictionStatus: restriction });
  assert.equal(readiness.status, 'META_ADS_BLOCKED_EXTERNAL');

  const gateway = createMetaAdsMutationGateway({
    store,
    readBefore: async mutation => structuredClone(mutation.before_state),
    killSwitch: makeKillSwitch(),
    accountRestriction: restriction,
    now,
  });
  const result = await gateway.preflight(metaMutation());
  assert.equal(result.status, 'META_ADS_BLOCKED_EXTERNAL');
  assert.equal(result.writes_executed, 0);
});

test('Meta Ads writes are disabled by default', async t => {
  const store = makeStore(t);
  const gateway = createMetaAdsMutationGateway({
    store,
    readBefore: async mutation => structuredClone(mutation.before_state),
    killSwitch: makeKillSwitch(),
    now,
  });
  const result = await gateway.execute(metaMutation());
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('writes_disabled_by_default'));
});

test('Meta Ads low-risk allowlist executes through gateway and verifies read-after', async t => {
  const store = makeStore(t);
  const calls = [];
  const gateway = createMetaAdsMutationGateway({
    store,
    readBefore: async mutation => structuredClone(mutation.before_state),
    readAfter: async mutation => structuredClone(mutation.proposed_after_state),
    applyMutation: async (mutation, options) => { calls.push({ mutation, options }); },
    killSwitch: makeKillSwitch(),
    now,
    writesEnabled: true,
  });
  const result = await gateway.execute(metaMutation());
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.writes_executed, 1);
  assert.equal(calls.length, 1);
  assert.equal(store.verify().ok, true);
});

test('Meta Ads protected and arbitrary mutations are denied', async t => {
  const store = makeStore(t);
  const gateway = createMetaAdsMutationGateway({
    store,
    readBefore: async mutation => structuredClone(mutation.before_state),
    killSwitch: makeKillSwitch(),
    now,
    writesEnabled: true,
  });
  const billing = await gateway.preflight(metaMutation({
    mutation_type: 'BILLING_CHANGE',
    approval_class: POLICY_CLASSES.C_PROTECTED_DENY,
  }));
  assert.ok(billing.blockers.includes('protected_operation_denied'));
  const unknown = await gateway.preflight(metaMutation({ mutation_type: 'ARBITRARY_MUTATION' }));
  assert.ok(unknown.blockers.includes('invalid_mutation_request'));
});

test('Meta read-after failure reconciles and never silently trusts mutation response', async t => {
  const store = makeStore(t);
  const gateway = createMetaAdsMutationGateway({
    store,
    readBefore: async mutation => structuredClone(mutation.before_state),
    readAfter: async () => ({ status: 'STILL_ACTIVE' }),
    applyMutation: async () => {},
    killSwitch: makeKillSwitch(),
    now,
    writesEnabled: true,
  });
  const result = await gateway.execute(metaMutation());
  assert.equal(result.status, 'RECONCILIATION_REQUIRED');
  assert.equal(result.read_after_write.verified, false);
  assert.equal(result.writes_executed, 1);
});

test('Meta rollback plan is ready for reversible low-risk mutations', () => {
  const mutation = metaMutation();
  const snapshot = { id: 'snap-1', captured_at: new Date(now()).toISOString(), objects: mutation.before_state };
  const plan = buildMetaRollbackPlan(mutation, snapshot, { now });
  assert.equal(plan.status, 'ROLLBACK_READY');
  assert.equal(plan.inverse.change_id, `${mutation.change_id}-rollback`);
});

test('Meta spend defaults off and enforces explicit caps, scope, expiry, and kill switch', () => {
  assert.equal(spendReadiness({}).enabled, false);
  assert.equal(normalizeMetaSpendPolicy({}).global_kill_switch, true);

  const policy = normalizeMetaSpendPolicy({
    META_ADS_SPEND_ENABLED: 'true',
    META_ADS_MAX_DAILY_SPEND_EUR: '20',
    META_ADS_MAX_EXPERIMENT_SPEND_EUR: '10',
    META_ADS_MAX_MONTHLY_SPEND_EUR: '100',
    META_ADS_GLOBAL_KILL_SWITCH: 'false',
    META_ADS_CAMPAIGN_KILL_SWITCH: 'false',
    META_ADS_EXPERIMENT_KILL_SWITCH: 'false',
  });
  const auth = createMetaSpendAuthorization({
    authorizationId: 'spend-1',
    adAccountId: 'act_123',
    campaignIds: ['101'],
    maxCostEur: 10,
    expiresAt: FUTURE,
    now,
  });
  const mutation = metaMutation({ mutation_type: 'SPEND_INCREASE', max_cost_eur: 5, campaign_id: '101', approval_class: POLICY_CLASSES.B_OPERATOR_APPROVAL_REQUIRED });
  const allowed = assertMetaSpendAuthorization({ policy, authorization: auth, mutation, now });
  assert.equal(allowed.allowed, true);
  assert.equal(assertMetaSpendAuthorization({ policy, authorization: auth, mutation: { ...mutation, max_cost_eur: 11 }, now }).allowed, false);
  assert.equal(assertMetaSpendAuthorization({ policy, authorization: auth, mutation: { ...mutation, campaign_id: '202' }, now }).allowed, false);
  assert.equal(assertMetaSpendAuthorization({ policy, authorization: null, mutation, now }).allowed, false);
});

test('Meta experiments are approval-gated, spend-bounded, and serendipity concurrency limited', () => {
  const input = {
    experiment_id: 'meta-exp-1',
    experiment_class: 'SERENDIPITY_TEST',
    objective: 'Test one bounded creative variant',
    hypothesis: 'A tested variant may improve high-intent action',
    ad_account_id: 'act_123',
    scope: [{ level: 'ad', id: 'ad_1' }],
    before_snapshot: { status: 'PAUSED' },
    planned_mutation: { mutation_type: 'CREATE_PAUSED_AD_VARIANT' },
    max_spend_eur: 5,
    start_at: new Date(FIXED_NOW + 1000).toISOString(),
    expires_at: new Date(FIXED_NOW + 60 * 60 * 1000).toISOString(),
    stop_conditions: ['no_high_intent_action'],
    success_metrics: ['high_intent_action'],
    rollback_plan: { restore: 'before_snapshot' },
    primary_business_outcome: 'high_intent_action',
  };
  const experiment = createMetaExperiment(input, { now });
  assert.equal(experiment.status, 'DRAFT');
  assert.equal(assertMetaExperimentBudget(experiment, normalizeMetaSpendPolicy({})).ok, false);
  const enabledPolicy = normalizeMetaSpendPolicy({
    META_ADS_SPEND_ENABLED: 'true',
    META_ADS_MAX_EXPERIMENT_SPEND_EUR: '10',
    META_ADS_MAX_DAILY_SPEND_EUR: '20',
    META_ADS_MAX_MONTHLY_SPEND_EUR: '100',
    META_ADS_GLOBAL_KILL_SWITCH: 'false',
  });
  assert.equal(assertMetaExperimentBudget(experiment, enabledPolicy).ok, true);
  let staged = transitionMetaExperiment(experiment, 'PREFLIGHT', { now });
  staged = transitionMetaExperiment(staged, 'AWAITING_APPROVAL', { now });
  assert.throws(() => transitionMetaExperiment(staged, 'RUNNING', { now }), /operator_approval_required/);
  assert.equal(serendipityExperimentBlocked([experiment], input, enabledPolicy).blocked, true);
  assert.equal(strongerBusinessOutcome('real_revenue_or_customer', 'click'), true);
});

test('Instagram organic canary defaults disabled and never publishes', async () => {
  const result = await validateOnlyInstagramCanary({
    env: {},
    now,
    mediaAsset: { media_type: 'REELS', video_url: 'https://cdn.example.com/video.mp4', caption: 'test' },
  });
  assert.equal(result.real_instagram_publication_attempted, false);
  assert.ok(result.blockers.includes('instagram_organic_canary_disabled_by_default'));
});

test('Instagram Stories contract and Reel caption limits fail closed', () => {
  assert.equal(contentPolicyPreflight({ mediaType: 'STORIES', videoUrl: 'https://cdn.example.com/video.mp4', caption: 'not allowed' }).ok, false);
  assert.equal(contentPolicyPreflight({ mediaType: 'REELS', videoUrl: 'https://cdn.example.com/video.mp4', caption: 'x'.repeat(2201) }).ok, false);
  assert.throws(
    () => contentPolicyPreflight({ mediaType: 'REELS', videoUrl: 'http://cdn.example.com/video.mp4', caption: 'ok' }),
    /media_url_must_be_https/,
  );
});

function instagramFixture(t, { status = 'FINISHED', permissions = true } = {}) {
  const store = makeStore(t);
  let publishCalls = 0;
  const permissionsList = permissions
    ? [
      'instagram_basic',
      'pages_show_list',
      'pages_read_engagement',
      'instagram_manage_insights',
      'instagram_content_publish',
    ].map(permission => ({ permission, status: 'granted' }))
    : [];
  const transport = {
    async get(endpoint) {
      if (endpoint === '/me/permissions') return { data: permissionsList };
      if (endpoint === '/me/accounts') {
        return { data: [{ id: 'page_1', name: 'Parma', instagram_business_account: { id: '123', username: 'parma.divinibenedetti' } }] };
      }
      if (endpoint === '/123/media') return { data: [] };
      if (endpoint === '/123/insights') return { data: [] };
      if (endpoint === '/111') return { id: '111', status_code: status, status };
      if (endpoint === '/222') {
        return {
          id: '222',
          media_type: 'REELS',
          media_product_type: 'REELS',
          permalink: 'https://www.instagram.com/p/parma-canary/',
          timestamp: new Date(now()).toISOString(),
          username: 'parma.divinibenedetti',
        };
      }
      if (endpoint === '/222/insights') return { data: [{ name: 'reach', values: [{ value: 10 }] }] };
      throw new Error(`unexpected get ${endpoint}`);
    },
    async post(endpoint) {
      if (endpoint === '/123/media') { publishCalls += 1; return { id: '111' }; }
      if (endpoint === '/123/media_publish') { publishCalls += 1; return { id: '222' }; }
      throw new Error(`unexpected post ${endpoint}`);
    },
  };
  return { store, transport, getPublishCalls: () => publishCalls };
}

function instagramEnv(overrides = {}) {
  return {
    INSTAGRAM_ORGANIC_CANARY_ENABLED: 'true',
    INSTAGRAM_ORGANIC_KILL_SWITCH: 'false',
    INSTAGRAM_ORGANIC_AUDIT_INTEGRITY_KEY: AUDIT_KEY,
    ...overrides,
  };
}

function instagramAuth() {
  return buildInstagramCanaryAuthorization({
    username: 'parma.divinibenedetti',
    mediaUrl: 'https://cdn.example.com/video.mp4',
    mediaType: 'REELS',
    caption: 'Parma fresh pasta',
    expiresAt: FUTURE,
    now,
  });
}

test('Instagram canary validates, publishes, verifies, and records immutable audit', async t => {
  const f = instagramFixture(t);
  const auth = instagramAuth();
  const validated = await validateOnlyInstagramCanary({
    env: instagramEnv(),
    now,
    transport: f.transport,
    adAccountId: 'act_123',
    username: 'parma.divinibenedetti',
    mediaAsset: { media_type: 'REELS', video_url: 'https://cdn.example.com/video.mp4', caption: 'Parma fresh pasta' },
    auditStore: f.store,
    authorization: auth,
  });
  assert.equal(validated.status, 'READY_FOR_INSTAGRAM_CANARY');
  assert.equal(f.getPublishCalls(), 0);

  const result = await executeInstagramCanary({
    env: instagramEnv(),
    now,
    transport: f.transport,
    adAccountId: 'act_123',
    username: 'parma.divinibenedetti',
    instagramUserId: '123',
    mediaAsset: { media_type: 'REELS', video_url: 'https://cdn.example.com/video.mp4', caption: 'Parma fresh pasta' },
    auditStore: f.store,
    authorization: auth,
  });
  assert.equal(result.status, 'INSTAGRAM_PUBLISH_VERIFIED');
  assert.equal(result.instagram_media_id, '222');
  assert.equal(result.permalink, 'https://www.instagram.com/p/parma-canary/');
  assert.equal(f.getPublishCalls(), 2);
  assert.equal(f.store.verify().ok, true);
});

test('Instagram canary prefers the verified Page-linked Instagram Business read path over Instagram Login', async t => {
  const f = instagramFixture(t);
  let loginCalls = 0;
  const loginTransport = {
    async get() {
      loginCalls += 1;
      throw new Error('login_path_should_not_be_called');
    },
  };
  const result = await validateOnlyInstagramCanary({
    env: instagramEnv(),
    now,
    transport: f.transport,
    loginTransport,
    adAccountId: 'act_123',
    username: 'parma.divinibenedetti',
    mediaAsset: { media_type: 'REELS', video_url: 'https://cdn.example.com/video.mp4', caption: 'Parma fresh pasta' },
    auditStore: f.store,
    authorization: instagramAuth(),
  });
  assert.equal(result.status, 'READY_FOR_INSTAGRAM_CANARY');
  assert.equal(loginCalls, 0);
  assert.equal(result.capability.resolved_read_path, 'facebook_page_linked_instagram_business');
});

test('Instagram canary blocks permission failure and username mismatch', async t => {
  const noPermission = instagramFixture(t, { permissions: false });
  const blocked = await validateOnlyInstagramCanary({
    env: instagramEnv(),
    now,
    transport: noPermission.transport,
    adAccountId: 'act_123',
    username: 'parma.divinibenedetti',
    mediaAsset: { media_type: 'REELS', video_url: 'https://cdn.example.com/video.mp4', caption: 'Parma fresh pasta' },
    auditStore: noPermission.store,
    authorization: instagramAuth(),
  });
  assert.ok(blocked.blockers.includes('instagram_content_publish_not_verified'));

  const mismatch = instagramFixture(t);
  const mismatchResult = await validateOnlyInstagramCanary({
    env: instagramEnv(),
    now,
    transport: mismatch.transport,
    adAccountId: 'act_123',
    username: 'different.username',
    mediaAsset: { media_type: 'REELS', video_url: 'https://cdn.example.com/video.mp4', caption: 'Parma fresh pasta' },
    auditStore: mismatch.store,
    authorization: buildInstagramCanaryAuthorization({
      username: 'different.username',
      mediaUrl: 'https://cdn.example.com/video.mp4',
      mediaType: 'REELS',
      caption: 'Parma fresh pasta',
      expiresAt: FUTURE,
      now,
    }),
  });
  assert.equal(mismatchResult.status, 'BLOCKED');
  assert.ok(mismatchResult.blockers.some(x => x.includes('username')));
});

test('Instagram canary handles container ERROR, EXPIRED, and polling timeout', async t => {
  for (const status of ['ERROR', 'EXPIRED']) {
    const f = instagramFixture(t, { status });
    const result = await executeInstagramCanary({
      env: instagramEnv(),
      now,
      transport: f.transport,
      adAccountId: 'act_123',
      instagramUserId: '123',
      mediaAsset: { media_type: 'REELS', video_url: 'https://cdn.example.com/video.mp4', caption: 'Parma fresh pasta' },
      auditStore: f.store,
      authorization: instagramAuth(),
      polling: { timeoutMs: 1000, intervalMs: 1 },
    });
    assert.equal(result.status, status === 'ERROR' ? 'CONTAINER_FAILED' : 'CONTAINER_EXPIRED');
    assert.equal(result.real_instagram_publication_attempted, false);
  }

  const f = instagramFixture(t);
  const timeout = await executeInstagramCanary({
    env: instagramEnv(),
    now,
    transport: f.transport,
    adAccountId: 'act_123',
    instagramUserId: '123',
    mediaAsset: { media_type: 'REELS', video_url: 'https://cdn.example.com/video.mp4', caption: 'Parma fresh pasta' },
    auditStore: f.store,
    authorization: instagramAuth(),
    polling: { timeoutMs: 0, intervalMs: 1 },
  });
  assert.equal(timeout.status, 'POLLING_TIMEOUT');
});

test('Instagram duplicate prevention and missing media asset fail before publish', async t => {
  const missing = await validateOnlyInstagramCanary({
    env: instagramEnv(),
    now,
    transport: instagramFixture(t).transport,
    adAccountId: 'act_123',
    username: 'parma.divinibenedetti',
    auditStore: instagramFixture(t).store,
    authorization: instagramAuth(),
  });
  assert.equal(missing.status, 'NEEDS_MEDIA_ASSET');

  const f = instagramFixture(t);
  const hash = require('../instagram-organic-canary').contentHash('https://cdn.example.com/video.mp4', 'Parma fresh pasta', 'REELS');
  const duplicate = await validateOnlyInstagramCanary({
    env: instagramEnv(),
    now,
    transport: f.transport,
    adAccountId: 'act_123',
    username: 'parma.divinibenedetti',
    mediaAsset: { media_type: 'REELS', video_url: 'https://cdn.example.com/video.mp4', caption: 'Parma fresh pasta' },
    auditStore: f.store,
    authorization: instagramAuth(),
    readPublishedHashes: async () => [hash],
  });
  assert.ok(duplicate.blockers.includes('duplicate_content_detected'));
});

test('Instagram content autonomy proposes selection but never authorizes publishing', () => {
  assert.equal(CONTENT_AUTONOMY_DEFAULT.publish_autonomy, false);
  assert.equal(CONTENT_AUTONOMY_DEFAULT.content_autonomy, true);
  const media = [
    { id: '1', caption: 'Parma fresh pasta tonight', insights: { reach: 100, views: 200, likes: 30, comments: 5, shares: 2, saved: 1 } },
    { id: '2', caption: 'Evergreen Parma pasta', insights: { reach: 500, views: 800, likes: 80, comments: 10, shares: 4, saved: 3 } },
    { id: '3', caption: 'Offer 20% off this week only', insights: { reach: 900, views: 1200, likes: 100, comments: 20, shares: 10, saved: 8 } },
  ];
  const selected = selectHistoricalCandidate({ media, history: [], now, maxCandidates: 3 });
  assert.equal(selected.length, 1);
  assert.equal(selected.some(item => item.id === '3'), false);
  assert.equal(staleContentMarkers('Offer 20% off this week only', now).stale, true);
  const proposal = buildInstagramPublicationProposal({ media: media[1], mediaType: 'REELS', caption: null, now });
  assert.equal(proposal.publish_autonomy, false);
  assert.equal(proposal.content_autonomy, true);
});
