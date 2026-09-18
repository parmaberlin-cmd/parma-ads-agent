'use strict';

// Economic (spend) job path.
//
// Deliberately SEPARATE from the non-economic commercial plan path: the
// commercial runner keeps spend_allowed: literal false and the unattended
// runner keeps job_spend_must_remain_false. Nothing here relaxes those
// contracts. This module adds one explicit, narrowly allowlisted budget
// action with its own signed, expiring, capped and durably scheduled envelope.
//
// Guarantees:
//   * only an allowlisted campaign may be targeted;
//   * the budget resource must belong to that campaign (verified live);
//   * live budget must equal plan.before_budget_micros (fail closed on drift);
//   * target <= max_budget_micros <= 8.00 EUR/day authority ceiling;
//   * target - before <= max_increment_micros <= +4.00 EUR authority ceiling;
//   * HMAC-signed envelope + plan digest binding + nonce + expiry;
//   * execute_at is durable on the volume (no in-memory timer);
//   * one validate-only call, then one write, read-back verification, audit;
//   * after an ambiguous provider write: read-only reconciliation, never a
//     blind retry.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');
const { stableStringify } = require('./ads-controlled-execution-core');
const { createBudgetRestAdapter } = require('./google-budget-rest-adapter');
const { customerFrom, configured } = require('./google-write-path');
const { commercialAuditStore } = require('./google-ads-commercial-runner');

const CUSTOMER_ID = '7376153998';
const ALLOWLIST = Object.freeze(new Set(['23853417314']));
const AUTHORITY_MAX_BUDGET_MICROS = 8000000;
const AUTHORITY_MAX_INCREMENT_MICROS = 4000000;
const DEFAULT_INTERVAL_MS = 15000;

const ID = z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
const ISO = z.string().datetime();
const MICROS = z.number().int().positive().safe();
const BUDGET_RESOURCE = z.string().regex(/^customers\/\d{1,20}\/campaignBudgets\/\d{1,20}$/);
const HEX = z.string().regex(/^[a-f0-9]{64}$/);

const planSchema = z.object({
  schema: z.literal('google_ads.economic_budget_plan.v1'),
  plan_id: ID,
  customer_id: z.literal(CUSTOMER_ID),
  campaign_id: ID,
  budget_resource_name: BUDGET_RESOURCE,
  before_budget_micros: MICROS,
  target_budget_micros: MICROS,
  max_increment_micros: z.number().int().nonnegative().safe(),
  max_budget_micros: MICROS,
  spend_allowed: z.literal(true),
}).strict();

const envelopeSchema = z.object({
  schema: z.literal('google_ads.economic_budget_job.v1'),
  job_id: ID,
  created_at: ISO,
  execute_at: ISO,
  expires_at: ISO,
  nonce: ID,
  plan: z.record(z.unknown()),
  plan_digest: HEX,
  signature: HEX,
}).strict();

const JOB_RESULTS = Object.freeze({
  DONE: 'DONE',
  NOT_DUE: 'NOT_DUE',
  EXPIRED: 'EXPIRED',
  FAILED_SAFE: 'FAILED_SAFE',
  NEEDS_HUMAN: 'NEEDS_HUMAN',
  RECONCILED_DONE: 'RECONCILED_DONE',
});

function integrityKey(env = process.env) {
  const secret = env.ADS_AUDIT_INTEGRITY_KEY;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('economic_job_integrity_key_unavailable');
  return crypto.createHash('sha256').update(`parma-google-ads-economic-budget-v1:${secret}`).digest();
}

function planDigest(plan) {
  return crypto.createHash('sha256').update(stableStringify(plan)).digest('hex');
}

function signEnvelope(envelope, key) {
  const { signature, ...body } = envelope;
  return crypto.createHmac('sha256', key).update(stableStringify(body)).digest('hex');
}

function verifyEnvelope(envelope, key) {
  try {
    const expected = Buffer.from(signEnvelope(envelope, key), 'hex');
    const provided = Buffer.from(String((envelope && envelope.signature) || ''), 'hex');
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  } catch (error) {
    return false;
  }
}

function buildEnvelope({ jobId, plan, nonce, executeAt, expiresAt, key = null, now = Date.now } = {}) {
  const blockers = [];
  if (!ID.safeParse(jobId).success) blockers.push('job_id_invalid');
  if (!ID.safeParse(nonce).success) blockers.push('nonce_invalid');
  const parsed = planSchema.safeParse(plan);
  if (!parsed.success) blockers.push('plan_invalid');
  if (!Number.isFinite(Date.parse(executeAt))) blockers.push('execute_at_invalid');
  if (!Number.isFinite(Date.parse(expiresAt))) blockers.push('expires_at_invalid');
  if (blockers.length) return { blockers };
  const clock = now();
  if (Date.parse(expiresAt) <= clock) blockers.push('expires_at_in_past');
  if (Date.parse(expiresAt) <= Date.parse(executeAt)) blockers.push('expires_at_not_after_execute_at');
  if (blockers.length) return { blockers };
  const envelope = {
    schema: 'google_ads.economic_budget_job.v1',
    job_id: jobId,
    created_at: new Date(clock).toISOString(),
    execute_at: new Date(Date.parse(executeAt)).toISOString(),
    expires_at: new Date(Date.parse(expiresAt)).toISOString(),
    nonce,
    plan: parsed.data,
    plan_digest: planDigest(parsed.data),
    signature: '0'.repeat(64),
  };
  envelope.signature = signEnvelope(envelope, key || integrityKey());
  return { envelope };
}

function validateEconomicJob(job, { now = Date.now, liveBudgetMicros = null, liveBudgetResource = null, key = null } = {}) {
  const parsed = envelopeSchema.safeParse(job);
  if (!parsed.success) return { ok: false, blockers: ['economic_job_schema_invalid'] };
  const plan = planSchema.safeParse(job.plan);
  if (!plan.success) return { ok: false, blockers: ['economic_plan_invalid'] };
  const value = plan.data;
  const blockers = [];
  if (!ALLOWLIST.has(value.campaign_id)) blockers.push('economic_campaign_not_allowlisted');
  if (value.max_budget_micros > AUTHORITY_MAX_BUDGET_MICROS) blockers.push('economic_authority_budget_exceeded');
  if (value.target_budget_micros > AUTHORITY_MAX_BUDGET_MICROS) blockers.push('economic_target_exceeds_authority');
  if (value.max_increment_micros > AUTHORITY_MAX_INCREMENT_MICROS) blockers.push('economic_authority_increment_exceeded');
  if (value.target_budget_micros > value.max_budget_micros) blockers.push('economic_target_exceeds_plan_cap');
  if (value.target_budget_micros - value.before_budget_micros > value.max_increment_micros) blockers.push('economic_increment_exceeds_plan_cap');
  if (value.target_budget_micros === value.before_budget_micros) blockers.push('economic_no_op_change');
  if (planDigest(value) !== job.plan_digest) blockers.push('economic_plan_digest_mismatch');
  try {
    if (!verifyEnvelope(job, key || integrityKey())) blockers.push('economic_job_signature_invalid');
  } catch (error) {
    blockers.push('economic_job_signature_invalid');
  }
  if (Date.parse(job.expires_at) <= now()) blockers.push('economic_job_expired');
  if (liveBudgetMicros !== null && liveBudgetMicros !== value.before_budget_micros) blockers.push('economic_before_budget_drift');
  if (liveBudgetResource !== null && liveBudgetResource !== value.budget_resource_name) blockers.push('economic_budget_resource_drift');
  return { ok: blockers.length === 0, blockers, plan: value };
}

function storeDirectory(env = process.env) {
  if (typeof env.ADS_ECONOMIC_JOB_PATH === 'string' && path.isAbsolute(env.ADS_ECONOMIC_JOB_PATH)) return env.ADS_ECONOMIC_JOB_PATH;
  if (typeof env.RAILWAY_VOLUME_MOUNT_PATH === 'string' && path.isAbsolute(env.RAILWAY_VOLUME_MOUNT_PATH)) return path.join(env.RAILWAY_VOLUME_MOUNT_PATH, 'parma-ads-economic-jobs');
  return null;
}

function atomicWrite(file, payload) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const handle = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(handle, payload); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  fs.renameSync(temporary, file);
}

class EconomicJobStore {
  constructor({ directory, integrityKey: key, now = Date.now }) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory === path.parse(directory).root) throw new Error('economic_job_directory_invalid');
    if (!Buffer.isBuffer(key) || key.length < 32) throw new Error('economic_job_key_invalid');
    this.key = Buffer.from(key);
    this.now = now;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = fs.realpathSync(directory);
    this.incoming = path.join(this.directory, 'incoming');
    this.state = path.join(this.directory, 'state');
    this.results = path.join(this.directory, 'results');
    this.done = path.join(this.directory, 'done');
    for (const dir of [this.incoming, this.state, this.results, this.done]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  static fromEnv(env = process.env, options = {}) {
    const directory = storeDirectory(env);
    if (!directory) throw new Error('economic_job_directory_unavailable');
    return new EconomicJobStore({ directory, integrityKey: integrityKey(env), now: options.now });
  }

  seal(payload) {
    const body = stableStringify(payload);
    return JSON.stringify({ payload: body, mac: crypto.createHmac('sha256', this.key).update(body).digest('hex') });
  }

  unseal(file) {
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof (envelope && envelope.payload) !== 'string' || typeof (envelope && envelope.mac) !== 'string') throw new Error('economic_job_store_corrupt');
    const expected = crypto.createHmac('sha256', this.key).update(envelope.payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(envelope.mac, 'hex'), Buffer.from(expected, 'hex'))) throw new Error('economic_job_store_integrity_failed');
    return JSON.parse(envelope.payload);
  }

  submit(job) {
    const parsed = envelopeSchema.safeParse(job);
    if (!parsed.success) throw new Error('economic_job_envelope_invalid');
    if (!verifyEnvelope(parsed.data, this.key)) throw new Error('economic_job_signature_invalid');
    if (planDigest(parsed.data.plan) !== parsed.data.plan_digest) throw new Error('economic_plan_digest_mismatch');
    const plan = planSchema.parse(parsed.data.plan);
    if (!ALLOWLIST.has(plan.campaign_id)) throw new Error('economic_campaign_not_allowlisted');
    const file = path.join(this.incoming, `${parsed.data.job_id}.json`);
    if (fs.existsSync(file)) throw new Error('economic_job_already_submitted');
    atomicWrite(file, this.seal(parsed.data));
    return parsed.data;
  }

  listIncoming() {
    if (!fs.existsSync(this.incoming)) return [];
    const entries = [];
    for (const name of fs.readdirSync(this.incoming).filter(candidate => candidate.endsWith('.json'))) {
      try { entries.push({ job: this.unseal(path.join(this.incoming, name)), file: path.join(this.incoming, name) }); } catch (error) { /* reported as corrupt by caller */ }
    }
    return entries.sort((a, b) => Date.parse(a.job.execute_at) - Date.parse(b.job.execute_at) || String(a.job.job_id).localeCompare(String(b.job.job_id)));
  }

  writeState(jobId, payload) {
    atomicWrite(path.join(this.state, `${jobId}.json`), this.seal({ job_id: jobId, updated_at: new Date(this.now()).toISOString(), ...payload }));
    return payload;
  }

  readState(jobId) {
    const file = path.join(this.state, `${jobId}.json`);
    return fs.existsSync(file) ? this.unseal(file) : null;
  }

  writeResult(result) {
    atomicWrite(path.join(this.results, `${result.job_id}.json`), this.seal({ updated_at: new Date(this.now()).toISOString(), ...result }));
    return result;
  }

  readResult(jobId) {
    const file = path.join(this.results, `${jobId}.json`);
    return fs.existsSync(file) ? this.unseal(file) : null;
  }

  archive(jobId) {
    const from = path.join(this.incoming, `${jobId}.json`);
    if (!fs.existsSync(from)) return false;
    fs.renameSync(from, path.join(this.done, `${jobId}.json`));
    return true;
  }
}

async function readCampaignBudget(customer, campaignId) {
  const rows = await customer.query(`SELECT campaign.id, campaign.status, campaign.campaign_budget, campaign_budget.resource_name, campaign_budget.amount_micros FROM campaign WHERE campaign.id = ${campaignId} LIMIT 1`);
  const row = (rows || [])[0];
  if (!row || !row.campaign) throw new Error('economic_campaign_unreadable');
  const resource = String(row.campaign.campaign_budget || (row.campaign_budget && row.campaign_budget.resource_name) || '');
  const micros = Number(row.campaign_budget && row.campaign_budget.amount_micros);
  if (!BUDGET_RESOURCE.safeParse(resource).success) throw new Error('economic_budget_resource_unreadable');
  if (!Number.isSafeInteger(micros) || micros <= 0) throw new Error('economic_budget_amount_unreadable');
  return { campaign_id: String(row.campaign.id), campaign_status: row.campaign.status, budget_resource_name: resource, amount_micros: micros };
}

function auditAppend(store, kind, payload) {
  if (!store || typeof store.append !== 'function') return null;
  try { return store.append(kind, payload); } catch (error) { return null; }
}

async function processEconomicJob({
  entry,
  store,
  env = process.env,
  now = Date.now,
  customer = null,
  auditStore = null,
  adapterFactory = createBudgetRestAdapter,
  readBudget = readCampaignBudget,
  log = () => {},
} = {}) {
  const job = entry.job;
  const plan = planSchema.parse(job.plan);
  const clock = now();
  const priorState = store.readState(job.job_id);
  const priorResult = store.readResult(job.job_id);
  if (priorResult) return { job_id: job.job_id, result: priorResult.result, state: 'ALREADY_RESOLVED', provider_write: false, writes_executed: 0 };

  if (Date.parse(job.expires_at) <= clock) {
    const result = { job_id: job.job_id, result: JOB_RESULTS.EXPIRED, state: 'EXPIRED', provider_write: false, writes_executed: 0, blockers: ['economic_job_expired'] };
    store.writeResult(result);
    store.archive(job.job_id);
    auditAppend(auditStore, 'audit', { event: 'economic_job_expired', job_id: job.job_id, plan_digest: job.plan_digest });
    return result;
  }
  if (Date.parse(job.execute_at) > clock) {
    store.writeState(job.job_id, { state: 'SCHEDULED', execute_at: job.execute_at, attempts: (priorState && priorState.attempts) || 0 });
    log({ event: 'economic_job_scheduled', job_id: job.job_id, execute_at: job.execute_at, provider_write: false, writes_executed: 0 });
    return { job_id: job.job_id, result: JOB_RESULTS.NOT_DUE, state: 'SCHEDULED', provider_write: false, writes_executed: 0 };
  }

  const activeCustomer = customer || (configured(env) ? customerFrom(env) : null);
  if (!activeCustomer) return { job_id: job.job_id, result: JOB_RESULTS.NEEDS_HUMAN, state: 'NEEDS_HUMAN', blockers: ['google_provider_credentials_unavailable'], provider_write: false, writes_executed: 0 };

  if (priorState && priorState.state === 'PROVIDER_WRITE_PENDING') {
    const live = await readBudget(activeCustomer, plan.campaign_id);
    const verified = live.amount_micros === plan.target_budget_micros;
    const untouched = live.amount_micros === plan.before_budget_micros;
    const result = verified
      ? { job_id: job.job_id, result: JOB_RESULTS.RECONCILED_DONE, state: 'VERIFIED_COMPLETE', provider_write: false, writes_executed: 0, observed_budget_micros: live.amount_micros, blockers: [] }
      : (untouched
        ? { job_id: job.job_id, result: JOB_RESULTS.FAILED_SAFE, state: 'FAILED_SAFE', provider_write: false, writes_executed: 0, observed_budget_micros: live.amount_micros, blockers: ['economic_write_not_applied'] }
        : { job_id: job.job_id, result: JOB_RESULTS.NEEDS_HUMAN, state: 'NEEDS_HUMAN', provider_write: false, writes_executed: 0, observed_budget_micros: live.amount_micros, blockers: ['economic_ambiguous_provider_state'] });
    store.writeResult(result);
    store.archive(job.job_id);
    auditAppend(auditStore, 'audit', { event: 'economic_job_reconciled', job_id: job.job_id, plan_digest: job.plan_digest, result: result.result, observed_budget_micros: live.amount_micros });
    return result;
  }

  const live = await readBudget(activeCustomer, plan.campaign_id);
  const check = validateEconomicJob(job, { now, liveBudgetMicros: live.amount_micros, liveBudgetResource: live.budget_resource_name, key: store.key });
  if (!check.ok) {
    const result = { job_id: job.job_id, result: JOB_RESULTS.FAILED_SAFE, state: 'FAILED_SAFE', provider_write: false, writes_executed: 0, observed_budget_micros: live.amount_micros, blockers: check.blockers };
    store.writeResult(result);
    store.archive(job.job_id);
    auditAppend(auditStore, 'audit', { event: 'economic_job_blocked', job_id: job.job_id, plan_digest: job.plan_digest, blockers: check.blockers, observed_budget_micros: live.amount_micros });
    log({ event: 'economic_job_blocked', job_id: job.job_id, blockers: check.blockers, provider_write: false, writes_executed: 0 });
    return result;
  }

  const attempts = Number((priorState && priorState.attempts) || 0) + 1;
  store.writeState(job.job_id, { state: 'PROVIDER_WRITE_PENDING', attempts, execute_at: job.execute_at, before_budget_micros: plan.before_budget_micros, target_budget_micros: plan.target_budget_micros });
  auditAppend(auditStore, 'audit', { event: 'economic_job_provider_write_pending', job_id: job.job_id, plan_digest: job.plan_digest, campaign_id: plan.campaign_id, before_budget_micros: live.amount_micros, target_budget_micros: plan.target_budget_micros, spend_allowed: true });

  const adapter = adapterFactory(activeCustomer);
  const operation = { entity: 'campaign_budget', operation: 'update', resource: { resource_name: plan.budget_resource_name, amount_micros: plan.target_budget_micros } };
  try {
    await adapter.mutateResources([operation], { validate_only: true, partial_failure: false });
    auditAppend(auditStore, 'audit', { event: 'economic_job_validate_only', job_id: job.job_id, plan_digest: job.plan_digest, provider_write: false });
    await adapter.mutateResources([operation], { validate_only: false, partial_failure: false });
  } catch (error) {
    const message = String((error && error.message) || error);
    const ambiguous = /ambiguous|timeout|ECONNABORTED|ETIMEDOUT/i.test(message);
    const result = {
      job_id: job.job_id,
      result: ambiguous ? JOB_RESULTS.NEEDS_HUMAN : JOB_RESULTS.FAILED_SAFE,
      state: ambiguous ? 'AMBIGUOUS' : 'FAILED_SAFE',
      provider_write: false,
      writes_executed: 0,
      blockers: [ambiguous ? 'economic_ambiguous_provider_write' : 'economic_provider_write_failed'],
      detail: message.slice(0, 160),
    };
    if (ambiguous) {
      auditAppend(auditStore, 'audit', { event: 'economic_job_write_ambiguous', job_id: job.job_id, plan_digest: job.plan_digest, detail: result.detail });
      return result;
    }
    store.writeResult(result);
    store.archive(job.job_id);
    auditAppend(auditStore, 'audit', { event: 'economic_job_write_failed', job_id: job.job_id, plan_digest: job.plan_digest, blockers: result.blockers, detail: result.detail });
    log({ event: 'economic_job_result', job_id: job.job_id, result: result.result, provider_write: false, writes_executed: 0 });
    return result;
  }

  const after = await readBudget(activeCustomer, plan.campaign_id);
  const verified = after.amount_micros === plan.target_budget_micros && after.budget_resource_name === plan.budget_resource_name;
  const result = verified
    ? { job_id: job.job_id, result: JOB_RESULTS.DONE, state: 'VERIFIED_COMPLETE', provider_write: true, writes_executed: 1, before_budget_micros: live.amount_micros, after_budget_micros: after.amount_micros, blockers: [] }
    : { job_id: job.job_id, result: JOB_RESULTS.NEEDS_HUMAN, state: 'RECONCILIATION_REQUIRED', provider_write: true, writes_executed: 1, before_budget_micros: live.amount_micros, after_budget_micros: after.amount_micros, blockers: ['economic_readback_mismatch'] };
  store.writeResult(result);
  store.archive(job.job_id);
  auditAppend(auditStore, 'change', { event: 'economic_budget_write', job_id: job.job_id, plan_digest: job.plan_digest, campaign_id: plan.campaign_id, budget_resource_name: plan.budget_resource_name, before_budget_micros: live.amount_micros, after_budget_micros: after.amount_micros, provider_write: true, writes_executed: 1, spend_allowed: true, status: result.state });
  log({ event: 'economic_job_result', job_id: job.job_id, result: result.result, state: result.state, provider_write: result.provider_write, writes_executed: result.writes_executed });
  return result;
}

async function runEconomicOnce({ store = null, env = process.env, now = Date.now, customer = null, auditStore = null, adapterFactory = createBudgetRestAdapter, readBudget = readCampaignBudget, log = () => {} } = {}) {
  const jobs = store || EconomicJobStore.fromEnv(env, { now });
  const audit = auditStore || commercialAuditStore({ env, now });
  const outcomes = [];
  for (const entry of jobs.listIncoming()) outcomes.push(await processEconomicJob({ entry, store: jobs, env, now, customer, auditStore: audit, adapterFactory, readBudget, log }));
  return outcomes;
}

function startEconomicWorker({ env = process.env, log = entry => console.log(JSON.stringify(entry)), intervalMs = DEFAULT_INTERVAL_MS, ...options } = {}) {
  let ticking = false;
  const tick = async () => {
    if (ticking) return [];
    ticking = true;
    try {
      return await runEconomicOnce({ env, log, ...options });
    } catch (error) {
      log({ event: 'economic_job_worker_error', error: String((error && error.message) || error).split('\n')[0], provider_write: false, writes_executed: 0 });
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
  CUSTOMER_ID,
  ALLOWLIST,
  AUTHORITY_MAX_BUDGET_MICROS,
  AUTHORITY_MAX_INCREMENT_MICROS,
  JOB_RESULTS,
  planSchema,
  envelopeSchema,
  integrityKey,
  planDigest,
  signEnvelope,
  verifyEnvelope,
  buildEnvelope,
  validateEconomicJob,
  storeDirectory,
  EconomicJobStore,
  readCampaignBudget,
  processEconomicJob,
  runEconomicOnce,
  startEconomicWorker,
};
