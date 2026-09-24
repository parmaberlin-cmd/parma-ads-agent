'use strict';

// Unattended commercial execution worker.
//
// Handoff (a signed job on the persistent volume) is decoupled from execution:
// the worker runs inside the always-on Railway service process, so losing the
// initiating ssh/terminal/Codex session after handoff cannot stop or corrupt a
// job. Every job is a normal signed commercial plan executed through the
// existing controlled runner (kill switches, execution/activation/spend gates,
// digest binding, replay guard, independent read-back, rollback, durable audit).
//
// Checkpointing is derived from durable evidence, never from memory:
//   NOT_STARTED                 no durable record for the plan digest
//   RESERVED_ZERO_PROVIDER_WRITE reservation exists, provider boundary not crossed
//   PROVIDER_BOUNDARY_REACHED   provider started / a change record shows a write
//   VERIFIED_COMPLETE           execution_completed marker for the digest
//   FAILED_SAFE                 failed with proven zero provider write
//   AMBIGUOUS                   provider outcome unknown
//   NEEDS_HUMAN                 cannot be resolved without a human decision
// A restart therefore never causes a blind duplicate write: only NOT_STARTED,
// RESERVED_ZERO_PROVIDER_WRITE and FAILED_SAFE may run again, and only while a
// valid authorization grant is present.
const path = require('node:path');
const { verifyReadAfterWrite } = require('./ads-controlled-execution-core');
const {
  runCommercialOneShot,
  createCommercialReadState,
  commercialAuditStore,
  planDigest,
  CUSTOMER_ID,
} = require('./google-ads-commercial-runner');
const { createOperationalGoogleAdsControl } = require('./google-ads-operational-control');
const { configured, customerFrom } = require('./google-write-path');
const { UnattendedJobStore, jobStoreDirectory, jobIntegrityKey, verifyEnvelope } = require('./google-ads-unattended-job-store');

const JOB_STATES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  RESERVED_ZERO_PROVIDER_WRITE: 'RESERVED_ZERO_PROVIDER_WRITE',
  PROVIDER_BOUNDARY_REACHED: 'PROVIDER_BOUNDARY_REACHED',
  VERIFIED_COMPLETE: 'VERIFIED_COMPLETE',
  FAILED_SAFE: 'FAILED_SAFE',
  AMBIGUOUS: 'AMBIGUOUS',
  NEEDS_HUMAN: 'NEEDS_HUMAN',
  BLOCKED_EXTERNAL: 'BLOCKED_EXTERNAL',
});

const JOB_RESULTS = Object.freeze({
  DONE: 'DONE',
  BLOCKED_EXTERNAL: 'BLOCKED_EXTERNAL',
  NEEDS_HUMAN: 'NEEDS_HUMAN',
  FAILED_SAFE: 'FAILED_SAFE',
});

// Deterministic blockers: retrying cannot help, a human must change the job.
const DETERMINISTIC_BLOCKERS = Object.freeze([
  'commercial_execution_not_authorized',
  'commercial_activation_not_authorized',
  'commercial_kill_switch_closed',
  'spend_gate_must_remain_closed',
  'malformed_commercial_plan',
  'commercial_customer_mismatch',
  'commercial_plan_not_approved',
  'commercial_startup_already_consumed',
  'google_provider_credentials_unavailable',
  'audit_integrity_key_unavailable',
  'audit_path_unavailable',
  'job_authorization_expired',
  'unattended_emergency_stop',
  'spend_or_creation_action_blocked',
  'job_signature_invalid',
  'job_plan_digest_mismatch',
  'job_customer_mismatch',
  'job_spend_must_remain_false',
  'job_actions_required',
  'job_action_count_exceeds_grant',
  'job_action_not_authorized',
]);

const unattendedJobsEnabled = env => env?.GOOGLE_ADS_UNATTENDED_JOBS !== 'disabled';
const emergencyStop = env => env?.GOOGLE_ADS_EMERGENCY_STOP === 'true';

// A job may only execute when its signed grant is intact and scoped to exactly
// this plan. Anything else stops the job without touching the provider.
function validateJobAuthorization(job, key, { now = Date.now() } = {}) {
  const blockers = [];
  let signatureValid = false;
  try { signatureValid = verifyEnvelope(job, key); } catch { signatureValid = false; }
  if (!signatureValid) blockers.push('job_signature_invalid');
  try {
    if (planDigest(job.plan) !== job.plan_digest) blockers.push('job_plan_digest_mismatch');
  } catch { blockers.push('job_plan_digest_mismatch'); }
  if (String(job.plan?.customer_id || '') !== CUSTOMER_ID || job.authorization?.customer_id !== CUSTOMER_ID) blockers.push('job_customer_mismatch');
  if (job.plan?.spend_allowed !== false || job.authorization?.spend_allowed !== false) blockers.push('job_spend_must_remain_false');
  const actions = Array.isArray(job.plan?.actions) ? job.plan.actions : [];
  if (actions.length === 0) blockers.push('job_actions_required');
  if (actions.length > job.authorization?.max_actions) blockers.push('job_action_count_exceeds_grant');
  const allowed = new Set(job.authorization?.allowed_action_types || []);
  if (actions.some(action => !allowed.has(action?.action?.type))) blockers.push('job_action_not_authorized');
  if (Date.parse(job.authorization?.expires_at) <= now || Date.parse(job.expires_at) <= now) blockers.push('job_authorization_expired');
  return { ok: blockers.length === 0, blockers };
}

function jobStoreFromEnv(env = process.env, { now = Date.now } = {}) {
  const directory = jobStoreDirectory(env);
  if (!directory) throw new Error('job_store_directory_unavailable');
  return new UnattendedJobStore({ directory, integrityKey: jobIntegrityKey(env), now });
}

// Job-scoped gate overlay: the authorization grant replaces the persistent
// "writes closed by default" defaults for exactly this job, and never changes
// the process environment or the volume state.
function jobEnvironment(job, env = process.env) {
  return {
    ...env,
    GOOGLE_ADS_COMMERCIAL_PLAN_JSON: JSON.stringify(job.plan),
    GOOGLE_ADS_COMMERCIAL_APPROVED_PLAN_SHA256: job.plan_digest,
    GOOGLE_ADS_WRITE_KILL_SWITCH: 'false',
    GOOGLE_ADS_COMMERCIAL_KILL_SWITCH: 'false',
    GOOGLE_ADS_COMMERCIAL_EXECUTION_AUTHORIZED: 'true',
    GOOGLE_ADS_COMMERCIAL_ACTIVATION_AUTHORIZED: job.authorization.activation_allowed === true ? 'true' : '',
    GOOGLE_ADS_SPEND_ALLOWED: 'false',
  };
}

function classifyCheckpoint(records, digest, changeIds) {
  const forDigest = records.filter(record => record?.payload?.plan_digest === digest);
  const completed = forDigest.some(record => record.payload?.event === 'commercial_plan_execution_completed');
  const ambiguous = forDigest.some(record => record.payload?.event === 'commercial_plan_failed_ambiguous');
  const reserved = forDigest.some(record => ['commercial_plan_execution_reserved', 'commercial_plan_execution_started'].includes(record.payload?.event));
  const zeroWriteFailure = forDigest.some(record => record.payload?.event === 'commercial_plan_failed_zero_write');
  const providerStarted = forDigest.some(record => record.payload?.event === 'commercial_plan_provider_started');
  const providerWrite = records.some(record => record.kind === 'change'
    && changeIds.includes(record.payload?.change_id)
    && (record.payload?.provider_write === true || Number(record.payload?.writes_executed || 0) > 0));

  if (completed) return { state: JOB_STATES.VERIFIED_COMPLETE, reason: 'execution_completed_marker' };
  if (ambiguous) return { state: JOB_STATES.AMBIGUOUS, reason: 'ambiguous_provider_outcome' };
  if (providerStarted || providerWrite) return { state: JOB_STATES.PROVIDER_BOUNDARY_REACHED, reason: providerWrite ? 'provider_write_recorded' : 'provider_boundary_marker' };
  if (reserved) return { state: JOB_STATES.RESERVED_ZERO_PROVIDER_WRITE, reason: 'reservation_without_provider_boundary' };
  if (zeroWriteFailure) return { state: JOB_STATES.FAILED_SAFE, reason: 'failed_with_proven_zero_write' };
  return { state: JOB_STATES.NOT_STARTED, reason: 'no_durable_plan_evidence' };
}

// Read-only reconciliation: proves the desired state without any write.
async function reconcileFromReadBack({ plan, customer, readStateFactory = createCommercialReadState, now = Date.now, readBackAttempts = 3, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const actions = [];
  for (const item of plan.actions) {
    const readState = readStateFactory(customer, item);
    let actual = null;
    let verification = { verified: false, mismatches: [] };
    for (let attempt = 1; attempt <= readBackAttempts; attempt += 1) {
      try {
        actual = await readState();
      } catch (error) {
        actual = null;
        verification = { verified: false, mismatches: [{ field: 'read', expected: 'readable_state', actual: String(error?.message || error).split('\n')[0] }] };
        if (attempt < readBackAttempts) { await sleep(attempt * 250); continue; }
        break;
      }
      verification = verifyReadAfterWrite({ expected: item.proposed_after_state, actual, readCompletedAt: new Date(now()).toISOString() });
      if (verification.verified) break;
      if (attempt < readBackAttempts) await sleep(attempt * 250);
    }
    actions.push({ change_id: item.change_id, verified: verification.verified, mismatches: verification.mismatches || [] });
  }
  return { verified: actions.length > 0 && actions.every(action => action.verified), actions };
}

function dependencyStatus(jobStore, job) {
  for (const dependencyId of job.depends_on || []) {
    const result = jobStore.readResult(dependencyId);
    const state = jobStore.readState(dependencyId);
    const incoming = jobStore.listIncoming().some(entry => entry.job.job_id === dependencyId);
    if (!result && !state && !incoming) return { ok: false, terminal: true, reason: `dependency_unknown:${dependencyId}` };
    if (!result) return { ok: false, terminal: false, reason: `dependency_pending:${dependencyId}` };
    if (result.result !== JOB_RESULTS.DONE) return { ok: false, terminal: true, reason: `dependency_not_done:${dependencyId}:${result.result}` };
  }
  return { ok: true, terminal: false, reason: null };
}

function writeOutcome(jobStore, job, { result, state, checkpoint, attempts, providerWrite = false, writesExecuted = 0, actions = [], blockers = [], evidence = {}, archive = false }) {
  const stateRecord = jobStore.writeState(job.job_id, { state, attempts, checkpoint });
  const resultRecord = jobStore.writeResult({
    job_id: job.job_id,
    result,
    state,
    plan_id: job.plan?.plan_id || null,
    plan_digest: job.plan_digest || null,
    attempts,
    provider_write: providerWrite === true,
    writes_executed: Number(writesExecuted) || 0,
    actions: actions.map(action => ({ ...action })),
    blockers: blockers.slice(0, 20).map(blocker => String(blocker).slice(0, 500)),
    evidence: { ...evidence, checkpoint: stateRecord.checkpoint },
    created_at: job.created_at,
  });
  if (archive) jobStore.archive(job.job_id);
  return resultRecord;
}

async function processJob({
  entry,
  jobStore,
  env = process.env,
  now = Date.now,
  customer = null,
  auditStore = null,
  runner = runCommercialOneShot,
  readStateFactory = createCommercialReadState,
  controlFactory = createOperationalGoogleAdsControl,
  providerTransport = null,
  maxAttempts = 3,
  reconcile = reconcileFromReadBack,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const job = entry.job;
  const attempts = (jobStore.readState(job.job_id)?.attempts || 0);
  const changeIds = (job.plan.actions || []).map(item => item.change_id);
  const store = auditStore || commercialAuditStore({ env, now });
  const checkpoint = classifyCheckpoint(store.list(), job.plan_digest, changeIds);

  const authorization = validateJobAuthorization(job, jobStore.key, { now: now() });
  if (!authorization.ok) {
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.NEEDS_HUMAN, state: JOB_STATES.NEEDS_HUMAN, checkpoint: 'job_authorization_invalid',
      attempts, blockers: authorization.blockers, evidence: { provider_write: false, auto_retry: false }, archive: true,
    });
  }

  const dependency = dependencyStatus(jobStore, job);
  if (!dependency.ok) {
    return writeOutcome(jobStore, job, {
      result: dependency.terminal ? JOB_RESULTS.BLOCKED_EXTERNAL : JOB_RESULTS.BLOCKED_EXTERNAL,
      state: JOB_STATES.BLOCKED_EXTERNAL,
      checkpoint: dependency.reason,
      attempts,
      blockers: [dependency.reason],
      evidence: { dependency: dependency.reason, provider_write: false },
      archive: false,
    });
  }

  if (emergencyStop(env)) {
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.BLOCKED_EXTERNAL, state: JOB_STATES.BLOCKED_EXTERNAL, checkpoint: 'emergency_stop_set',
      attempts, blockers: ['emergency_stop_set'], evidence: { provider_write: false }, archive: false,
    });
  }

  if (Date.parse(job.authorization.expires_at) <= now() || Date.parse(job.expires_at) <= now()) {
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.NEEDS_HUMAN, state: JOB_STATES.NEEDS_HUMAN, checkpoint: 'authorization_expired',
      attempts, blockers: ['job_authorization_expired'], evidence: { provider_write: false, expires_at: job.authorization.expires_at }, archive: true,
    });
  }

  if (checkpoint.state === JOB_STATES.VERIFIED_COMPLETE) {
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.DONE, state: JOB_STATES.VERIFIED_COMPLETE, checkpoint: checkpoint.reason,
      attempts, evidence: { replay: 'already_completed', provider_write: false }, archive: true,
    });
  }

  if (checkpoint.state === JOB_STATES.PROVIDER_BOUNDARY_REACHED || checkpoint.state === JOB_STATES.AMBIGUOUS) {
    // Never retry across a reached provider boundary. Read-only reconciliation is
    // the only permitted resolution.
    const activeCustomer = customer || (configured(env) ? customerFrom(env) : null);
    const reconciliation = activeCustomer
      ? await reconcile({ plan: job.plan, customer: activeCustomer, readStateFactory, now, sleep })
      : { verified: false, actions: [], error: 'google_provider_credentials_unavailable' };
    return writeOutcome(jobStore, job, {
      result: reconciliation.verified ? JOB_RESULTS.DONE : JOB_RESULTS.NEEDS_HUMAN,
      state: reconciliation.verified
        ? JOB_STATES.VERIFIED_COMPLETE
        : (checkpoint.state === JOB_STATES.AMBIGUOUS ? JOB_STATES.AMBIGUOUS : JOB_STATES.NEEDS_HUMAN),
      checkpoint: reconciliation.verified ? 'reconciled_by_independent_read_back' : checkpoint.reason,
      attempts,
      actions: reconciliation.actions,
      blockers: reconciliation.verified ? [] : ['provider_outcome_requires_human_review'],
      evidence: { checkpoint_state: checkpoint.state, reconciliation, provider_write: false, auto_retry: false },
      archive: true,
    });
  }

  if (attempts >= maxAttempts) {
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.FAILED_SAFE, state: JOB_STATES.FAILED_SAFE, checkpoint: 'attempts_exhausted',
      attempts, blockers: ['attempts_exhausted'], evidence: { provider_write: false }, archive: true,
    });
  }

  const activeCustomer = customer || (configured(env) ? customerFrom(env) : null);
  if (!activeCustomer) {
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.NEEDS_HUMAN, state: JOB_STATES.NEEDS_HUMAN, checkpoint: 'provider_unavailable',
      attempts, blockers: ['google_provider_credentials_unavailable'], evidence: { provider_write: false }, archive: true,
    });
  }

  const attemptNumber = attempts + 1;
  jobStore.writeState(job.job_id, { state: JOB_STATES.RESERVED_ZERO_PROVIDER_WRITE, attempts: attemptNumber, checkpoint: `attempt_${attemptNumber}_starting` });

  const guardedControlFactory = options => controlFactory({
    ...options,
    beforeProviderMutation: async mutation => {
      if (emergencyStop(env)) throw new Error('unattended_emergency_stop');
      if (Date.parse(job.authorization.expires_at) <= now()) throw new Error('job_authorization_expired');
      return options.beforeProviderMutation(mutation);
    },
  });

  const outcome = await runner({
    env: jobEnvironment(job, env),
    mode: 'EXECUTE_APPROVED_PLAN',
    customer: activeCustomer,
    store,
    controlFactory: guardedControlFactory,
    readStateFactory,
    providerTransport,
    now,
  });
  const after = classifyCheckpoint(store.list(), job.plan_digest, changeIds);
  const blockers = outcome.blockers || [];

  if (outcome.status === 'VERIFIED') {
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.DONE, state: JOB_STATES.VERIFIED_COMPLETE, checkpoint: 'verified_complete',
      attempts: attemptNumber, providerWrite: outcome.provider_write === true, writesExecuted: outcome.writes_executed || 0,
      actions: outcome.results || [], evidence: { mode: outcome.mode, replay: outcome.replay_state || null, status: outcome.status }, archive: true,
    });
  }

  const replayReason = blockers.find(blocker => String(blocker).startsWith('commercial_plan_replay_blocked:'));
  if (replayReason && replayReason.endsWith(':commercial_plan_completed')) {
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.DONE, state: JOB_STATES.VERIFIED_COMPLETE, checkpoint: 'replay_already_completed',
      attempts: attemptNumber, blockers, evidence: { replay: replayReason, provider_write: false }, archive: true,
    });
  }

  if (after.state === JOB_STATES.PROVIDER_BOUNDARY_REACHED || after.state === JOB_STATES.AMBIGUOUS || replayReason) {
    // Preserve partial provider progress. A later ambiguous action must never
    // collapse already verified writes to zero, otherwise the durable result
    // could falsely look safe to replay.
    const partialActions = Array.isArray(outcome.results) ? outcome.results : [];
    const recordedWrites = Number(outcome.writes_executed) || partialActions.reduce(
      (sum, action) => sum + (Number(action?.writes_executed) || (action?.provider_write === true ? 1 : 0)),
      0,
    );
    const providerWrite = outcome.provider_write === true || recordedWrites > 0;
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.NEEDS_HUMAN,
      state: after.state === JOB_STATES.AMBIGUOUS ? JOB_STATES.AMBIGUOUS : JOB_STATES.NEEDS_HUMAN,
      checkpoint: after.reason, attempts: attemptNumber, blockers,
      providerWrite, writesExecuted: recordedWrites, actions: partialActions,
      evidence: { status: outcome.status, auto_retry: false, partial_progress_preserved: providerWrite }, archive: true,
    });
  }

  const deterministic = blockers.some(blocker => DETERMINISTIC_BLOCKERS.includes(String(blocker).split(':')[0]) || DETERMINISTIC_BLOCKERS.includes(String(blocker)));
  if (deterministic) {
    return writeOutcome(jobStore, job, {
      result: JOB_RESULTS.NEEDS_HUMAN, state: JOB_STATES.NEEDS_HUMAN, checkpoint: 'deterministic_blocker',
      attempts: attemptNumber, blockers, evidence: { status: outcome.status, provider_write: false }, archive: true,
    });
  }

  const remaining = attemptNumber < maxAttempts;
  return writeOutcome(jobStore, job, {
    result: JOB_RESULTS.FAILED_SAFE, state: JOB_STATES.FAILED_SAFE,
    checkpoint: remaining ? 'zero_write_failure_retryable' : 'zero_write_failure_attempts_exhausted',
    attempts: attemptNumber, blockers, evidence: { status: outcome.status, provider_write: false, retry_pending: remaining }, archive: !remaining,
  });
}

async function runUnattendedOnce({
  jobStore = null,
  env = process.env,
  now = Date.now,
  customer = null,
  auditStore = null,
  runner = runCommercialOneShot,
  readStateFactory = createCommercialReadState,
  controlFactory = createOperationalGoogleAdsControl,
  providerTransport = null,
  maxAttempts = 3,
  auditStoreFactory = null,
} = {}) {
  const store = jobStore || jobStoreFromEnv(env, { now });
  const sharedAudit = auditStore || (auditStoreFactory ? auditStoreFactory({ env, now }) : null);
  const outcomes = [];
  for (const file of store.listCorruptFiles()) {
    const jobId = path.basename(file, '.json');
    store.quarantineFile(file);
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(jobId)) continue;
    store.writeState(jobId, { state: JOB_STATES.NEEDS_HUMAN, attempts: 0, checkpoint: 'job_file_corrupt' });
    outcomes.push(store.writeResult({
      job_id: jobId, result: JOB_RESULTS.NEEDS_HUMAN, state: JOB_STATES.NEEDS_HUMAN,
      plan_id: null, plan_digest: null, attempts: 0, provider_write: false, writes_executed: 0,
      actions: [], blockers: ['job_file_corrupt'], evidence: { quarantined: path.basename(file) },
      created_at: new Date(now()).toISOString(),
    }));
  }
  for (const entry of store.listIncoming()) {
    outcomes.push(await processJob({ entry, jobStore: store, env, now, customer, auditStore: sharedAudit, runner, readStateFactory, controlFactory, providerTransport, maxAttempts }));
  }
  return outcomes;
}

function startUnattendedWorker({ env = process.env, log = entry => console.log(JSON.stringify(entry)), intervalMs = 15000, onError = null, ...options } = {}) {
  let ticking = false;
  const tick = async () => {
    if (ticking) return [];
    ticking = true;
    try {
      if (!unattendedJobsEnabled(env)) return [];
      const outcomes = await runUnattendedOnce({ env, ...options });
      for (const outcome of outcomes) log({ event: 'google_ads_unattended_job', result: outcome.result, state: outcome.state, job_id: outcome.job_id, provider_write: outcome.provider_write, writes_executed: outcome.writes_executed });
      return outcomes;
    } catch (error) {
      if (typeof onError === 'function') onError(error);
      log({ event: 'google_ads_unattended_worker_error', error: String(error?.message || error).split('\n')[0], provider_write: false });
      return [];
    } finally {
      ticking = false;
    }
  };
  const timer = setInterval(() => { tick(); }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  setImmediate(() => { tick(); });
  return { tick, stop: () => clearInterval(timer) };
}

module.exports = {
  JOB_STATES,
  JOB_RESULTS,
  DETERMINISTIC_BLOCKERS,
  CUSTOMER_ID,
  unattendedJobsEnabled,
  emergencyStop,
  validateJobAuthorization,
  jobStoreFromEnv,
  jobEnvironment,
  classifyCheckpoint,
  reconcileFromReadBack,
  dependencyStatus,
  processJob,
  runUnattendedOnce,
  startUnattendedWorker,
};
