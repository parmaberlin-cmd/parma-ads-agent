'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const {
  POLICY_CLASSES,
  ROLLBACK_STATUSES,
  EXPERIMENT_CLASSES,
  DEFAULT_EXPLORATION_POLICY,
  validateMutationRequest,
  classifyMutation,
  buildStateSnapshot,
  buildRollbackPlan,
  verifyRollbackResult,
  verifyReadAfterWrite,
  createExperimentDraft,
  transitionExperiment,
  assertExplorationBudget,
  concurrentExperimentBlocked,
  evaluateBusinessOutcome,
  AdsKillSwitch,
  ControlledAdsStore,
  ExperimentEngine,
  stableStringify,
} = require('../ads-controlled-execution-core');

const { createGoogleAdsMutationGateway } = require('../google-ads-mutation-gateway');

const FIXED_NOW = Date.parse('2026-09-07T12:00:00.000Z');
const now = () => FIXED_NOW;

function makeStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'controlled-ads-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new ControlledAdsStore({ directory, integrityKey: randomBytes(32), now });
}

function lowRiskMutation(overrides = {}) {
  return {
    change_id: 'chg-1',
    objective_id: 'obj-1',
    campaign_id: '23276824770',
    mutation_type: 'add_exact_negative_keyword',
    object_identifiers: ['customers/7376153998/campaignCriteria/23853417314~99'],
    before_state: { status: 'ENABLED', exact_negatives: [] },
    proposed_after_state: { status: 'ENABLED', exact_negatives: ['sly restaurant berlin'] },
    reason: 'Block a verified competitor term without touching protected local intent.',
    evidence: [{ type: 'search_term', reference: 'search_term_view/2026-09-04', captured_at: '2026-09-04T12:00:00.000Z' }],
    confidence: 0.92,
    risk_class: 'LOW',
    approval_class: POLICY_CLASSES.A_AUTONOMOUS_LOW_RISK,
    ...overrides,
  };
}

function gatewayFixture(t, overrides = {}) {
  const store = makeStore(t);
  const killSwitch = new AdsKillSwitch();
  const calls = [];
  const gateway = createGoogleAdsMutationGateway({
    store,
    killSwitch,
    now,
    readBefore: async mutation => structuredClone(mutation.before_state),
    readAfter: async () => ({ status: 'ENABLED', exact_negatives: ['sly restaurant berlin'] }),
    applyMutation: async (mutation, options) => { calls.push({ mutation, options }); },
    ...overrides,
  });
  return { store, killSwitch, calls, gateway };
}

function experimentInput(overrides = {}) {
  return {
    experiment_class: EXPERIMENT_CLASSES.SERENDIPITY_TEST,
    hypothesis: 'A narrower controlled term set may improve real reservation outcomes even if CTR falls.',
    reason_for_exploration: 'Current evidence does not clearly predict a CTR improvement.',
    baseline: { ctr: 0.04, cpc: 1.8, primary_outcome: 'click' },
    treatment: { ctr: 0.035, cpc: 1.95, primary_outcome: 'trusted_reservation_order_phone_action' },
    start_at: '2026-09-08T00:00:00.000Z',
    expires_at: '2026-09-10T00:00:00.000Z',
    max_cost_eur: 0,
    primary_success_metric: 'verified_reservation_or_order',
    secondary_metrics: ['ctr', 'cpc'],
    stop_loss_condition: 'trusted outcome evidence becomes negative',
    rollback_plan: { restore: 'before_state' },
    confidence_before: 0.45,
    campaign_id: '23276824770',
    low_volume_campaign: true,
    ...overrides,
  };
}

test('mutation request requires every controlled-write field', () => {
  const result = validateMutationRequest({ change_id: 'x' });
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('objective_id'));
  assert.ok(result.missing.includes('before_state'));
  assert.ok(result.missing.includes('proposed_after_state'));
});

test('mutation classes map low/controlled, approval, and protected correctly', () => {
  assert.equal(classifyMutation(lowRiskMutation()).policy_class, POLICY_CLASSES.A_AUTONOMOUS_LOW_RISK);
  assert.equal(classifyMutation(lowRiskMutation({ mutation_type: 'budget_change', approval_class: POLICY_CLASSES.B_EXPERIMENT_REQUIRES_APPROVAL })).approval_required, true);
  assert.equal(classifyMutation(lowRiskMutation({ mutation_type: 'conversion_action_change', approval_class: POLICY_CLASSES.C_PROTECTED_NEVER_AUTONOMOUS })).protected, true);
  assert.equal(classifyMutation(lowRiskMutation({ approval_class: POLICY_CLASSES.B_EXPERIMENT_REQUIRES_APPROVAL })).valid, false);
});

test('controlled store assigns versioned sequential ids and persists an immutable audit chain', t => {
  const store = makeStore(t);
  const state = store.append('state', { campaign_id: '1', status: 'ENABLED' });
  const change = store.append('change', { change_id: 'c1', snapshot_id: state.id });
  const experiment = store.append('experiment', { id: 'e1' });
  assert.equal(state.id, 'ADS_STATE_000001');
  assert.equal(change.id, 'CHANGE_000002');
  assert.equal(experiment.id, 'EXPERIMENT_000003');
  assert.equal(store.last('state').id, state.id);
  assert.equal(store.verify().ok, true);
});

test('controlled store redacts secrets and rejects tampering', t => {
  const store = makeStore(t);
  store.append('audit', { client_secret: 'top-secret', refresh_token: 'also-secret', public_field: 'ok' });
  const record = store.last('audit');
  assert.equal(record.payload.client_secret, '[redacted]');
  assert.equal(record.payload.refresh_token, '[redacted]');
  assert.equal(record.payload.public_field, 'ok');
  const envelope = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  envelope.payload = envelope.payload.replace('"ok"', '"changed"');
  fs.writeFileSync(store.file, JSON.stringify(envelope));
  assert.equal(store.verify().ok, false);
});

test('rollback plan builds an inverse and verifies restored state', () => {
  const mutation = lowRiskMutation();
  const snapshot = buildStateSnapshot({ campaign_id: mutation.campaign_id, exact_negatives: [] }, { now });
  snapshot.version_id = 'ADS_STATE_000001';
  const plan = buildRollbackPlan(mutation, snapshot, { now });
  assert.equal(plan.status, ROLLBACK_STATUSES.READY);
  assert.equal(plan.inverse.mutation_type, 'remove_agent_created_negative_keyword');
  assert.deepEqual(plan.inverse.proposed_after_state, mutation.before_state);
  assert.equal(verifyRollbackResult({ expected: mutation.before_state, actual: mutation.before_state }).status, ROLLBACK_STATUSES.VERIFIED);
  assert.equal(verifyRollbackResult({ expected: mutation.before_state, actual: { status: 'CHANGED' } }).status, ROLLBACK_STATUSES.FAILED);
});

test('read-after-write is mandatory and fails closed on mismatch', async t => {
  const { gateway } = gatewayFixture(t);
  const result = await gateway.simulate(lowRiskMutation());
  assert.equal(result.status, 'SIMULATED_VERIFIED');
  assert.equal(result.writes_executed, 0);
  assert.equal(result.provider_write, false);
  assert.equal(result.read_after_write.required, true);
  const failed = await gateway.simulate(lowRiskMutation(), { readAfterFailure: true });
  assert.equal(failed.status, 'SIMULATED_READ_AFTER_WRITE_FAILED');
  assert.equal(failed.read_after_write.verified, false);
});

test('gateway is write-disabled by default and requires a live executor when enabled', async t => {
  const { gateway } = gatewayFixture(t);
  assert.equal(gateway.status().writes_allowed, false);
  const result = await gateway.execute(lowRiskMutation());
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('writes_disabled_by_default'));
  assert.equal(result.writes_executed, 0);
});

test('gateway permits fake live low-risk writes only after explicit activation and verifies', async t => {
  const { gateway, calls } = gatewayFixture(t, { writesEnabled: true });
  const result = await gateway.execute(lowRiskMutation());
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.writes_executed, 1);
  assert.equal(result.provider_write, true);
  assert.equal(calls.length, 1);
});

test('approval-required mutations cannot execute without operator approval', async t => {
  const mutation = lowRiskMutation({ mutation_type: 'budget_change', approval_class: POLICY_CLASSES.B_EXPERIMENT_REQUIRES_APPROVAL });
  const { gateway } = gatewayFixture(t, { writesEnabled: true });
  const blocked = await gateway.execute(mutation);
  assert.ok(blocked.blockers.includes('operator_approval_required'));
  const approved = await gateway.execute(mutation, { approved: true });
  assert.equal(approved.status, 'VERIFIED');
});

test('protected mutations are denied before snapshot or execution', async t => {
  const { gateway, store } = gatewayFixture(t);
  const result = await gateway.preflight(lowRiskMutation({ mutation_type: 'billing_change', approval_class: POLICY_CLASSES.C_PROTECTED_NEVER_AUTONOMOUS }));
  assert.equal(result.accepted, false);
  assert.ok(result.blockers.includes('protected_operation_denied'));
  assert.equal(store.list('state').length, 0);
});

test('experiment lifecycle enforces approval, observation, decision, and expiry', () => {
  const draft = createExperimentDraft(experimentInput(), { now });
  assert.equal(draft.status, 'DRAFT');
  assert.equal(transitionExperiment(draft, 'PREFLIGHT', { now }).status, 'PREFLIGHT');
  assert.throws(() => transitionExperiment(draft, 'RUNNING', { now }), /experiment_transition_blocked:DRAFT:RUNNING/);
  let value = draft;
  value = transitionExperiment(value, 'PREFLIGHT', { now });
  value = transitionExperiment(value, 'AWAITING_APPROVAL', { now });
  assert.throws(() => transitionExperiment(value, 'RUNNING', { now }), /operator_approval_required/);
  value = transitionExperiment(value, 'RUNNING', { now, approved: true });
  value = transitionExperiment(value, 'OBSERVING', { now });
  value = transitionExperiment(value, 'KEEP', { now });
  assert.equal(value.status, 'CLOSED');
  assert.equal(value.outcome_decision, 'KEEP');
});

test('experiments expire automatically and cannot remain active indefinitely', () => {
  const draft = createExperimentDraft(experimentInput(), { now });
  const expired = transitionExperiment(draft, 'CLOSED', { now: () => Date.parse('2026-09-11T00:00:00.000Z'), reason: 'EXPIRED' });
  assert.equal(expired.status, 'CLOSED');
  assert.equal(expired.outcome_decision, 'EXPIRED');
  assert.equal(expired.stop_loss_triggered, true);
});

test('exploration defaults are disabled and spending/concurrency caps fail closed', () => {
  assert.equal(DEFAULT_EXPLORATION_POLICY.max_experiment_cost_eur, 0);
  assert.equal(DEFAULT_EXPLORATION_POLICY.max_concurrent_experiments, 0);
  assert.equal(assertExplorationBudget(experimentInput({ max_cost_eur: 1 }), DEFAULT_EXPLORATION_POLICY).ok, false);
  const active = [{ status: 'RUNNING', experiment_class: EXPERIMENT_CLASSES.SERENDIPITY_TEST }];
  assert.equal(concurrentExperimentBlocked(active, experimentInput(), DEFAULT_EXPLORATION_POLICY).blocked, true);
  const enabledPolicy = { ...DEFAULT_EXPLORATION_POLICY, max_experiment_cost_eur: 50, max_daily_experiment_cost_eur: 50, max_campaign_daily_budget_eur: 50, max_concurrent_experiments: 2 };
  assert.equal(assertExplorationBudget(experimentInput({ max_cost_eur: 10 }), enabledPolicy).ok, true);
});

test('experiment engine keeps only one serendipity experiment for low-volume campaigns by default', () => {
  const engine = new ExperimentEngine({ policy: { ...DEFAULT_EXPLORATION_POLICY, max_concurrent_experiments: 2, max_experiment_cost_eur: 50 }, now });
  const first = engine.create(experimentInput({ low_volume_campaign: true }));
  assert.throws(() => engine.create(experimentInput({ low_volume_campaign: true })), /single_serendipity/);
  assert.ok(first.id);
});

test('kill switch stops new mutations and resolves operator intents', () => {
  const kill = new AdsKillSwitch();
  assert.equal(kill.isBlocked({ campaign_id: '1' }).blocked, false);
  kill.stopAdsAutonomy();
  assert.equal(kill.isBlocked({ campaign_id: '1' }).blocked, true);
  const campaignKill = new AdsKillSwitch().disableCampaign('23276824770');
  assert.equal(campaignKill.state, 'CAMPAIGN_AUTONOMY_DISABLED');
  const stop = new AdsKillSwitch().resolveOperatorIntent('stop Ads autonomy');
  stop.action();
  assert.equal(stop.intent, 'stop_ads_autonomy');
  const rollback = new AdsKillSwitch().resolveOperatorIntent('rollback the last Ads change');
  rollback.action();
  assert.equal(rollback.intent, 'rollback_last_ads_change');
});

test('business outcome hierarchy prefers stronger real outcomes over CTR/CPC', () => {
  const result = evaluateBusinessOutcome({
    baseline: { ctr: 0.04, cpc: 1.8, primary_outcome: 'click' },
    treatment: { ctr: 0.035, cpc: 1.95, primary_outcome: 'trusted_reservation_order_phone_action' },
  });
  assert.equal(result.beneficial, true);
  assert.equal(result.ctr_worse, true);
  assert.equal(result.cpc_worse, true);
});

test('booking_completed remains untrusted for autonomous reservation optimization', () => {
  const { conversionPolicy } = require('../economic-ground-truth');
  assert.equal(conversionPolicy('booking_completed').allowed_for_autonomous_booking_optimization, false);
  assert.equal(conversionPolicy('booking_completed').trust, 'UNTRUSTED_AS_RESERVATION');
});

test('stable serialization is deterministic for historical compatibility', () => {
  const a = { b: 1, a: { d: 2, c: 3 } };
  const b = { a: { c: 3, d: 2 }, b: 1 };
  assert.equal(stableStringify(a), stableStringify(b));
});

test('gateway simulation persists proposal, snapshot, change, and audit records without secrets', async t => {
  const { gateway, store } = gatewayFixture(t);
  await gateway.simulate(lowRiskMutation());
  assert.equal(store.list('state').length, 1);
  assert.equal(store.list('change').length, 1);
  assert.equal(store.list('audit').length, 1);
  const serialized = fs.readFileSync(store.file, 'utf8');
  assert.ok(!serialized.includes('top-secret'));
  assert.ok(serialized.includes('SIMULATED_VERIFIED'));
});
