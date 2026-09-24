'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { ControlledAdsStore } = require('../ads-controlled-execution-core');
const { planDigest } = require('../google-ads-commercial-runner');
const { UnattendedJobStore, signEnvelope } = require('../google-ads-unattended-job-store');
const {
  JOB_STATES,
  JOB_RESULTS,
  validateJobAuthorization,
  reconcileFromReadBack,
  runUnattendedOnce,
} = require('../google-ads-unattended-runner');
const { buildEnvelope } = require('../scripts/submit-commercial-job');

const CUSTOMER_ID = '7376153998';
const CAMPAIGN_ID = '23276824770';
const now = () => Date.parse('2026-09-15T12:00:00.000Z');
const hours = value => value * 60 * 60 * 1000;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unattended-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const key = randomBytes(32);
  return {
    root,
    key,
    jobStore: new UnattendedJobStore({ directory: path.join(root, 'jobs'), integrityKey: key, now }),
    auditStore: new ControlledAdsStore({ directory: path.join(root, 'audit'), integrityKey: randomBytes(32), now }),
  };
}

function negativeAction(text, changeId) {
  return {
    action: { type: 'negative_add', campaign_id: CAMPAIGN_ID, campaign_resource_name: `customers/${CUSTOMER_ID}/campaigns/${CAMPAIGN_ID}`, text, match_type: 'PHRASE' },
    readback: { kind: 'CAMPAIGN_NEGATIVE', text, match_type: 'PHRASE' },
    before_state: { present: false, count: 0, text, match_type: 'PHRASE' },
    proposed_after_state: { present: true, count: 1, text, match_type: 'PHRASE' },
    change_id: changeId, objective_id: 'unattended-objective',
    reason: 'Unattended controlled change.', evidence: [{ type: 'operator_approval', reference: 'unattended-job' }], confidence: 1,
  };
}

function commercialPlan({ planId = 'unattended-plan-1', actions = null } = {}) {
  return {
    schema: 'google_ads.commercial_plan.v1', plan_id: planId, customer_id: CUSTOMER_ID, spend_allowed: false,
    actions: actions || [negativeAction('glutenfrei', 'change-glutenfrei')],
  };
}

function envelopeFor(plan, overrides = {}) {
  return {
    schema: 'google_ads.unattended_job.v1',
    job_id: 'job-1',
    created_at: new Date(now()).toISOString(),
    expires_at: new Date(now() + hours(6)).toISOString(),
    depends_on: [],
    plan,
    plan_digest: planDigest(plan),
    authorization: {
      grant_id: 'grant-1', issued_at: new Date(now()).toISOString(), expires_at: new Date(now() + hours(6)).toISOString(),
      customer_id: CUSTOMER_ID, allowed_action_types: ['negative_add', 'keyword_create', 'rsa_update'],
      activation_allowed: false, spend_allowed: false, max_actions: 10, nonce: 'nonce-1', signature: '0'.repeat(64),
    },
    ...overrides,
  };
}

function submit(f, plan, overrides = {}, envelopeOverrides = {}) {
  const envelope = { ...envelopeFor(plan, envelopeOverrides), ...overrides };
  envelope.authorization = { ...envelope.authorization, signature: signEnvelope(envelope, f.key) };
  return f.jobStore.submit(envelope);
}

function provider({ failWrite = null } = {}) {
  const calls = { validate: 0, write: 0 };
  const customer = { customerId: CUSTOMER_ID, query: async () => [], mutateResources: async () => { throw new Error('grpc_mutateResources_must_not_be_used'); } };
  const transport = {
    mutateResources: async (_operations, options) => {
      if (options.validate_only === true) { calls.validate += 1; return { results: [], http_status: 200, provider_write: false }; }
      calls.write += 1;
      if (failWrite) throw failWrite();
      return { results: [], http_status: 200, provider_write: true };
    },
  };
  return { customer, transport, calls };
}

const readStateFactory = writeCounter => (_customer, item) => async () => (writeCounter() > 0 ? item.proposed_after_state : item.before_state);
const environment = extra => ({ GOOGLE_CUSTOMER_ID: CUSTOMER_ID, GOOGLE_ADS_SPEND_ALLOWED: 'false', ...extra });

test('normal completion terminates durably as DONE with per-action evidence', async t => {
  const f = fixture(t);
  const plan = commercialPlan();
  submit(f, plan);
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].result, JOB_RESULTS.DONE);
  assert.equal(outcomes[0].state, JOB_STATES.VERIFIED_COMPLETE);
  assert.equal(outcomes[0].writes_executed, 1);
  assert.equal(p.calls.write, 1);
  const durable = f.jobStore.readResult('job-1');
  assert.equal(durable.result, 'DONE');
  assert.equal(durable.plan_digest, planDigest(plan));
  assert.deepEqual(durable.actions.map(action => action.change_id), ['change-glutenfrei']);
  assert.equal(f.jobStore.readState('job-1').state, JOB_STATES.VERIFIED_COMPLETE);
  assert.equal(fs.existsSync(path.join(f.jobStore.incoming, 'job-1.json')), false, 'terminal jobs leave the queue');
  assert.equal(fs.existsSync(path.join(f.jobStore.done, 'job-1.json')), true);
});

test('handoff is decoupled from execution: the submitter can disconnect and never writes', async t => {
  const f = fixture(t);
  const p = provider();
  const handoff = {
    job_id: 'job-1', plan: commercialPlan(),
    authorization: { grant_id: 'grant-1', expires_at: new Date(now() + hours(2)).toISOString(), customer_id: CUSTOMER_ID, allowed_action_types: ['negative_add'], activation_allowed: false, spend_allowed: false, max_actions: 5, nonce: 'nonce-1' },
  };
  const built = buildEnvelope(handoff, { now: now() });
  assert.equal(built.blockers, undefined);
  const envelope = { ...built.envelope, authorization: { ...built.envelope.authorization, signature: signEnvelope(built.envelope, f.key) } };
  f.jobStore.submit(envelope);
  // Submitter is gone: no transport object existed in that process at all.
  assert.equal(p.calls.validate + p.calls.write, 0);
  assert.equal(fs.existsSync(path.join(f.jobStore.incoming, 'job-1.json')), true, 'job survives the disconnected client');
  // The always-on service worker later picks the job up independently.
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.DONE);
  assert.equal(p.calls.write, 1);
});

test('restart before the provider boundary resumes exactly once (no duplicate write)', async t => {
  const f = fixture(t);
  const plan = commercialPlan();
  submit(f, plan);
  const digest = planDigest(plan);
  f.auditStore.append('audit', { event: 'commercial_plan_execution_reserved', plan_id: plan.plan_id, plan_digest: digest, customer_id: CUSTOMER_ID, replay_reason: 'commercial_plan_new', spend_allowed: false });
  f.jobStore.writeState('job-1', { state: JOB_STATES.RESERVED_ZERO_PROVIDER_WRITE, attempts: 1, checkpoint: 'attempt_1_starting' });
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.DONE);
  assert.equal(outcomes[0].attempts, 2);
  assert.equal(p.calls.write, 1, 'resume writes exactly once');
});

test('restart after the provider boundary never re-writes: reconciliation proves completion', async t => {
  const f = fixture(t);
  const plan = commercialPlan();
  submit(f, plan);
  const digest = planDigest(plan);
  f.auditStore.append('audit', { event: 'commercial_plan_execution_reserved', plan_id: plan.plan_id, plan_digest: digest, customer_id: CUSTOMER_ID, spend_allowed: false });
  f.auditStore.append('audit', { event: 'commercial_plan_provider_started', plan_id: plan.plan_id, plan_digest: digest, change_id: 'change-glutenfrei', customer_id: CUSTOMER_ID, spend_allowed: false });
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => 1), reconcile: async () => ({ verified: true, actions: [{ change_id: 'change-glutenfrei', verified: true, mismatches: [] }] }),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.DONE);
  assert.equal(outcomes[0].state, JOB_STATES.VERIFIED_COMPLETE);
  assert.match(outcomes[0].evidence.checkpoint, /reconciled/);
  assert.equal(p.calls.write, 0, 'no write is replayed after the provider boundary');
});

test('restart after the provider boundary with unprovable state needs a human', async t => {
  const f = fixture(t);
  const plan = commercialPlan();
  submit(f, plan);
  f.auditStore.append('audit', { event: 'commercial_plan_provider_started', plan_id: plan.plan_id, plan_digest: planDigest(plan), change_id: 'change-glutenfrei', customer_id: CUSTOMER_ID, spend_allowed: false });
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => 0), reconcile: async () => ({ verified: false, actions: [{ change_id: 'change-glutenfrei', verified: false, mismatches: [] }] }),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.NEEDS_HUMAN);
  assert.equal(outcomes[0].state, JOB_STATES.NEEDS_HUMAN);
  assert.equal(outcomes[0].evidence.auto_retry, false);
  assert.equal(p.calls.write, 0);
});

test('ambiguous provider outcome stops without retry', async t => {
  const f = fixture(t);
  const plan = commercialPlan();
  submit(f, plan);
  f.auditStore.append('audit', { event: 'commercial_plan_failed_ambiguous', plan_id: plan.plan_id, plan_digest: planDigest(plan), customer_id: CUSTOMER_ID, provider_boundary_started: true, provider_write: false, spend_allowed: false });
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => 0),
    reconcile: async () => ({ verified: false, actions: [] }),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.NEEDS_HUMAN);
  assert.equal(outcomes[0].state, JOB_STATES.AMBIGUOUS);
  assert.equal(outcomes[0].evidence.auto_retry, false);
  assert.equal(p.calls.write, 0);
});

test('completed plan is rejected for replay and never written twice', async t => {
  const f = fixture(t);
  const plan = commercialPlan();
  submit(f, plan);
  f.auditStore.append('audit', { event: 'commercial_plan_execution_completed', plan_id: plan.plan_id, plan_digest: planDigest(plan), customer_id: CUSTOMER_ID, result_count: 1, writes_executed: 1, spend_allowed: false });
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => 1),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.DONE);
  assert.equal(outcomes[0].evidence.replay, 'already_completed');
  assert.equal(p.calls.write, 0);
});

test('zero-write failure is safely resumable', async t => {
  const f = fixture(t);
  const plan = commercialPlan();
  submit(f, plan);
  f.auditStore.append('audit', { event: 'commercial_plan_failed_zero_write', plan_id: plan.plan_id, plan_digest: planDigest(plan), customer_id: CUSTOMER_ID, provider_boundary_started: false, provider_write: false, spend_allowed: false });
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.DONE);
  assert.equal(p.calls.write, 1);
});

test('the durable result is machine readable and integrity protected', async t => {
  const f = fixture(t);
  submit(f, commercialPlan());
  const p = provider();
  await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  const file = path.join(f.jobStore.results, 'job-1.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(typeof raw.payload, 'string');
  assert.match(raw.mac, /^[a-f0-9]{64}$/);
  const tampered = { ...raw, payload: raw.payload.replace('DONE', 'FAILED_SAFE') };
  fs.writeFileSync(file, JSON.stringify(tampered));
  assert.throws(() => f.jobStore.readResult('job-1'), /job_store_integrity_failed/);
});

test('dependency ordering blocks a dependent job until its dependency is DONE', async t => {
  const f = fixture(t);
  const first = commercialPlan({ planId: 'unattended-plan-1' });
  const second = commercialPlan({ planId: 'unattended-plan-2', actions: [negativeAction('glutenfreie pizza', 'change-glutenfreie-pizza')] });
  submit(f, first);
  const dependent = envelopeFor(second, { job_id: 'job-2', depends_on: ['job-1'] });
  dependent.authorization = { ...dependent.authorization, signature: signEnvelope(dependent, f.key) };
  f.jobStore.submit(dependent);
  const p = provider();
  const options = {
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  };
  // A dependent job must not run while its dependency is still queued.
  const delegate = {
    key: f.jobStore.key,
    listIncoming: () => f.jobStore.listIncoming().filter(entry => entry.job.job_id === 'job-2'),
    listCorruptFiles: () => [],
    quarantineFile: file => f.jobStore.quarantineFile(file),
    readState: jobId => f.jobStore.readState(jobId),
    readResult: jobId => f.jobStore.readResult(jobId),
    writeState: (jobId, state) => f.jobStore.writeState(jobId, state),
    writeResult: result => f.jobStore.writeResult(result),
    archive: jobId => f.jobStore.archive(jobId),
  };
  const firstPassDependent = await runUnattendedOnce({ ...options, jobStore: delegate });
  assert.equal(firstPassDependent[0].result, JOB_RESULTS.BLOCKED_EXTERNAL);
  assert.match(firstPassDependent[0].blockers[0], /dependency_(pending|unknown):job-1/);
  assert.equal(p.calls.write, 0);
  const pass1 = await runUnattendedOnce(options);
  assert.deepEqual(pass1.map(outcome => outcome.job_id), ['job-1', 'job-2']);
  assert.equal(pass1[0].result, JOB_RESULTS.DONE);
  assert.equal(pass1[1].result, JOB_RESULTS.DONE, 'job-2 runs only after job-1 is terminal DONE in the same pass');
  assert.equal(p.calls.write, 2);
});

test('a dependent job is blocked when its dependency terminates without DONE', async t => {
  const f = fixture(t);
  const blockedPlan = commercialPlan({
    planId: 'unattended-plan-1',
    actions: [{
      action: { type: 'rsa_update', campaign_id: CAMPAIGN_ID, resource_name: `customers/${CUSTOMER_ID}/adGroupAds/195806633999~815570579504`, status: 'ENABLED' },
      readback: { kind: 'RESOURCE_STATUS', resource_name: `customers/${CUSTOMER_ID}/adGroupAds/195806633999~815570579504` },
      before_state: { present: true, resource_name: `customers/${CUSTOMER_ID}/adGroupAds/195806633999~815570579504`, status: 'PAUSED' },
      proposed_after_state: { present: true, resource_name: `customers/${CUSTOMER_ID}/adGroupAds/195806633999~815570579504`, status: 'ENABLED' },
      change_id: 'change-enable', objective_id: 'unattended-objective', reason: 'Activation gate.', evidence: [{ type: 'operator_approval', reference: 'job-1' }], confidence: 1,
    }],
  });
  const firstEnvelope = envelopeFor(blockedPlan, { plan_digest: planDigest(blockedPlan) });
  firstEnvelope.authorization = { ...firstEnvelope.authorization, allowed_action_types: ['rsa_update'], activation_allowed: false };
  firstEnvelope.authorization = { ...firstEnvelope.authorization, signature: signEnvelope(firstEnvelope, f.key) };
  f.jobStore.submit(firstEnvelope);
  submit(f, commercialPlan({ planId: 'unattended-plan-2', actions: [negativeAction('glutenfreie pizza', 'change-glutenfreie-pizza')] }), { job_id: 'job-2', depends_on: ['job-1'] });
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.deepEqual(outcomes.map(outcome => outcome.result), [JOB_RESULTS.NEEDS_HUMAN, JOB_RESULTS.BLOCKED_EXTERNAL]);
  assert.match(outcomes[1].blockers[0], /dependency_not_done:job-1:NEEDS_HUMAN/);
  assert.equal(p.calls.write, 0);
  assert.equal(fs.existsSync(path.join(f.jobStore.incoming, 'job-2.json')), true, 'blocked dependent job stays queued');
});

test('kill switch closed blocks execution without any provider call and stays pending', async t => {
  const f = fixture(t);
  submit(f, commercialPlan());
  const p = provider();
  const blocked = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment({ GOOGLE_ADS_EMERGENCY_STOP: 'true' }), now,
    customer: p.customer, providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(blocked[0].result, JOB_RESULTS.BLOCKED_EXTERNAL);
  assert.equal(blocked[0].state, JOB_STATES.BLOCKED_EXTERNAL);
  assert.equal(p.calls.validate + p.calls.write, 0);
  assert.equal(fs.existsSync(path.join(f.jobStore.incoming, 'job-1.json')), true, 'job is preserved for after the stop');
  const resumed = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(resumed[0].result, JOB_RESULTS.DONE);
  assert.equal(p.calls.write, 1);
});

test('spend and creation actions are refused with zero provider calls', async t => {
  const f = fixture(t);
  const plan = commercialPlan({
    actions: [{
      action: { type: 'campaign_budget_create', campaign_id: '0', resource_name: `customers/${CUSTOMER_ID}/campaignBudgets/-1`, name: 'Blocked', amount_micros: 1000000, explicitly_shared: false },
      readback: { kind: 'RESOURCE_STATUS', resource_name: `customers/${CUSTOMER_ID}/campaigns/${CAMPAIGN_ID}` },
      before_state: { present: false }, proposed_after_state: { present: true },
      change_id: 'change-budget', objective_id: 'unattended-objective', reason: 'Refused.', evidence: [{ type: 'operator_approval', reference: 'job-1' }], confidence: 1,
    }],
  });
  const envelope = envelopeFor(plan, { plan_digest: planDigest(plan) });
  const authorization = { ...envelope.authorization, allowed_action_types: ['campaign_budget_create'] };
  envelope.authorization = { ...authorization, signature: signEnvelope({ ...envelope, authorization }, f.key) };
  f.jobStore.submit(envelope);
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.NEEDS_HUMAN);
  assert.equal(outcomes[0].provider_write, false);
  assert.equal(outcomes[0].writes_executed, 0);
  assert.match(outcomes[0].blockers.join(','), /spend_or_creation_action_blocked|malformed_commercial_plan/);
  assert.equal(p.calls.write, 0);
});

test('activation stays gated unless the grant explicitly allows it', async t => {
  const f = fixture(t);
  const plan = commercialPlan({
    actions: [{
      action: { type: 'rsa_update', campaign_id: CAMPAIGN_ID, resource_name: `customers/${CUSTOMER_ID}/adGroupAds/195806633999~815570579504`, status: 'ENABLED' },
      readback: { kind: 'RESOURCE_STATUS', resource_name: `customers/${CUSTOMER_ID}/adGroupAds/195806633999~815570579504` },
      before_state: { present: true, resource_name: `customers/${CUSTOMER_ID}/adGroupAds/195806633999~815570579504`, status: 'PAUSED' },
      proposed_after_state: { present: true, resource_name: `customers/${CUSTOMER_ID}/adGroupAds/195806633999~815570579504`, status: 'ENABLED' },
      change_id: 'change-enable', objective_id: 'unattended-objective', reason: 'Activation must stay gated.', evidence: [{ type: 'operator_approval', reference: 'job-1' }], confidence: 1,
    }],
  });
  const envelope = envelopeFor(plan, { plan_digest: planDigest(plan) });
  const authorization = { ...envelope.authorization, allowed_action_types: ['rsa_update'], activation_allowed: false };
  envelope.authorization = { ...authorization, signature: signEnvelope({ ...envelope, authorization }, f.key) };
  f.jobStore.submit(envelope);
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment({ GOOGLE_ADS_COMMERCIAL_ACTIVATION_AUTHORIZED: '' }), now,
    customer: p.customer, providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.NEEDS_HUMAN);
  assert.deepEqual(outcomes[0].blockers, ['commercial_activation_not_authorized']);
  assert.equal(p.calls.write, 0);
});

test('a tampered or foreign job is refused before any provider call', async t => {
  const f = fixture(t);
  const key = f.key;
  const plan = commercialPlan();
  const envelope = envelopeFor(plan, { plan_digest: planDigest(plan) });
  const signed = { ...envelope, authorization: { ...envelope.authorization, signature: signEnvelope(envelope, key) } };
  // Tampering with the plan after signing must not authenticate.
  const tampered = { ...signed, plan: { ...plan, actions: [negativeAction('tampered', 'change-tampered')] } };
  assert.equal(validateJobAuthorization(tampered, key, { now: now() }).ok, false);
  assert.throws(() => f.jobStore.submit(tampered), /job_signature_invalid|job_plan_digest_mismatch/);
  // (a) A job bypassing submit but correctly sealed still fails the grant check.
  const sealed = JSON.stringify({ payload: JSON.stringify(tampered), mac: require('node:crypto').createHmac('sha256', key).update(JSON.stringify(tampered)).digest('hex') });
  fs.writeFileSync(path.join(f.jobStore.incoming, `${tampered.job_id}.json`), sealed);
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].result, JOB_RESULTS.NEEDS_HUMAN);
  assert.deepEqual(outcomes[0].blockers, ['job_signature_invalid', 'job_plan_digest_mismatch']);
  assert.equal(p.calls.write + p.calls.validate, 0);
  // (b) A corrupt file is quarantined instead of wedging or executing the queue.
  fs.writeFileSync(path.join(f.jobStore.incoming, 'job-corrupt.json'), JSON.stringify({ payload: '{}', mac: '0'.repeat(64) }));
  const quarantined = await runUnattendedOnce({ jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer, providerTransport: p.transport });
  assert.equal(quarantined.length, 1);
  assert.deepEqual(quarantined[0].blockers, ['job_file_corrupt']);
  assert.equal(fs.existsSync(path.join(f.jobStore.quarantine, 'job-corrupt.json')), true);
  assert.equal(p.calls.write + p.calls.validate, 0);
});

test('read-only reconciliation proves the desired state without any transport call', async t => {
  const f = fixture(t);
  const plan = commercialPlan();
  const customer = { customerId: CUSTOMER_ID };
  const verified = await reconcileFromReadBack({ plan, customer, readStateFactory: (_c, item) => async () => item.proposed_after_state, now });
  assert.equal(verified.verified, true);
  const unverified = await reconcileFromReadBack({ plan, customer, readStateFactory: (_c, item) => async () => item.before_state, now, readBackAttempts: 1, sleep: async () => {} });
  assert.equal(unverified.verified, false);
  assert.equal(unverified.actions[0].verified, false);
});

test('authorization scope is enforced: extra actions beyond the grant are refused', async t => {
  const f = fixture(t);
  const plan = commercialPlan({ actions: [negativeAction('glutenfrei', 'change-1'), negativeAction('glutenfreie pizza', 'change-2')] });
  const envelope = envelopeFor(plan, { plan_digest: planDigest(plan) });
  const authorization = { ...envelope.authorization, max_actions: 1 };
  envelope.authorization = { ...authorization, signature: signEnvelope({ ...envelope, authorization }, f.key) };
  assert.equal(validateJobAuthorization(envelope, f.key, { now: now() }).ok, false);
  f.jobStore.writeState('job-1', { state: JOB_STATES.NOT_STARTED, attempts: 0, checkpoint: 'queued' });
  f.jobStore.submit(envelope);
  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore, auditStore: f.auditStore, env: environment(), now, customer: p.customer,
    providerTransport: p.transport, readStateFactory: readStateFactory(() => p.calls.write),
  });
  assert.equal(outcomes[0].result, JOB_RESULTS.NEEDS_HUMAN);
  assert.deepEqual(outcomes[0].blockers, ['job_action_count_exceeds_grant']);
  assert.equal(p.calls.write, 0);
});


test('partial verified writes are never collapsed to zero when a later action is ambiguous', async t => {
  const f = fixture(t);
  const actions = [
    negativeAction('partial-1', 'change-partial-1'),
    negativeAction('partial-2', 'change-partial-2'),
    negativeAction('partial-3', 'change-partial-3'),
    negativeAction('partial-4', 'change-partial-4'),
    negativeAction('partial-5', 'change-partial-5'),
  ];
  const plan = commercialPlan({ planId: 'partial-write-accounting', actions });
  submit(f, plan);

  const runner = async ({ store }) => {
    for (const item of actions.slice(0, 4)) {
      store.append('change', {
        event: 'commercial_change_verified',
        plan_id: plan.plan_id,
        plan_digest: planDigest(plan),
        change_id: item.change_id,
        customer_id: CUSTOMER_ID,
        provider_write: true,
        writes_executed: 1,
        verified: true,
        spend_allowed: false,
      });
    }
    store.append('audit', {
      event: 'commercial_plan_failed_ambiguous',
      plan_id: plan.plan_id,
      plan_digest: planDigest(plan),
      change_id: actions[4].change_id,
      customer_id: CUSTOMER_ID,
      provider_boundary_started: true,
      provider_write: false,
      spend_allowed: false,
    });
    return {
      status: 'BLOCKED',
      blockers: ['provider_transport_ambiguous'],
      provider_write: true,
      writes_executed: 4,
      results: actions.slice(0, 4).map(item => ({
        change_id: item.change_id,
        provider_write: true,
        writes_executed: 1,
        verified: true,
      })),
    };
  };

  const p = provider();
  const outcomes = await runUnattendedOnce({
    jobStore: f.jobStore,
    auditStore: f.auditStore,
    env: environment(),
    now,
    customer: p.customer,
    runner,
    providerTransport: p.transport,
    readStateFactory: readStateFactory(() => 1),
  });

  assert.equal(outcomes[0].result, JOB_RESULTS.NEEDS_HUMAN);
  assert.equal(outcomes[0].state, JOB_STATES.AMBIGUOUS);
  assert.equal(outcomes[0].provider_write, true, 'partial provider writes must remain visible');
  assert.equal(outcomes[0].writes_executed, 4, 'four completed writes must never be reported as zero');
  assert.deepEqual(
    outcomes[0].actions.map(action => action.change_id),
    ['change-partial-1', 'change-partial-2', 'change-partial-3', 'change-partial-4'],
  );
  assert.equal(outcomes[0].evidence.auto_retry, false);
});
