'use strict';

// Durable job store for unattended commercial execution inside Railway.
//
// A job serialises: the signed plan, the approved digest and an explicit,
// expiring authorization grant. The store lives on the persistent volume, so a
// Railway restart can never lose the handoff, and the process that writes a job
// (an ssh handoff script or the service itself) never performs a provider write:
// execution happens later inside the always-on service worker.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');
const { stableStringify } = require('./ads-controlled-execution-core');
const { planDigest } = require('./google-ads-commercial-runner');

const ID = z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/);
const ISO = z.string().datetime();
const SIGNATURE = z.string().regex(/^[a-f0-9]{64}$/);

const authorizationSchema = z.object({
  grant_id: ID,
  issued_at: ISO,
  expires_at: ISO,
  customer_id: z.string().regex(/^\d{1,20}$/),
  allowed_action_types: z.array(z.string().regex(/^[a-z_]{1,64}$/)).min(1).max(32),
  activation_allowed: z.boolean(),
  spend_allowed: z.literal(false),
  max_actions: z.number().int().min(1).max(50),
  nonce: ID,
  signature: SIGNATURE,
}).strict();

const envelopeSchema = z.object({
  schema: z.literal('google_ads.unattended_job.v1'),
  job_id: ID,
  created_at: ISO,
  expires_at: ISO,
  depends_on: z.array(ID).max(4).default([]),
  plan: z.record(z.unknown()),
  plan_digest: DIGEST,
  authorization: authorizationSchema,
}).strict();

const stateSchema = z.object({
  schema: z.literal('google_ads.unattended_job_state.v1'),
  job_id: ID,
  state: z.enum(['NOT_STARTED', 'RESERVED_ZERO_PROVIDER_WRITE', 'PROVIDER_BOUNDARY_REACHED', 'VERIFIED_COMPLETE', 'FAILED_SAFE', 'AMBIGUOUS', 'NEEDS_HUMAN', 'BLOCKED_EXTERNAL']),
  attempts: z.number().int().min(0),
  checkpoint: z.string().min(1).max(200),
  updated_at: ISO,
}).strict();

const resultSchema = z.object({
  schema: z.literal('google_ads.unattended_job_result.v1'),
  job_id: ID,
  result: z.enum(['DONE', 'BLOCKED_EXTERNAL', 'NEEDS_HUMAN', 'FAILED_SAFE']),
  state: stateSchema.shape.state,
  plan_id: z.string().min(1).max(128).nullable(),
  plan_digest: DIGEST.nullable(),
  attempts: z.number().int().min(0),
  provider_write: z.boolean(),
  writes_executed: z.number().int().min(0),
  actions: z.array(z.record(z.unknown())).max(50),
  blockers: z.array(z.string().min(1).max(500)).max(20),
  evidence: z.record(z.unknown()),
  created_at: ISO,
  updated_at: ISO,
  signature: SIGNATURE,
}).strict();

function canonicalEnvelope(envelope) {
  const { signature, ...authorization } = envelope.authorization;
  return stableStringify({ ...envelope, authorization });
}

function jobIntegrityKey(env = process.env) {
  const secret = env.ADS_AUDIT_INTEGRITY_KEY;
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('job_integrity_key_unavailable');
  return crypto.createHash('sha256').update(`parma-google-ads-unattended-jobs-v1:${secret}`).digest();
}

function signEnvelope(envelope, key) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error('invalid_job_integrity_key');
  const { signature, ...authorization } = envelope.authorization;
  return crypto.createHmac('sha256', key).update(stableStringify({ ...envelope, authorization })).digest('hex');
}

function verifyEnvelope(envelope, key) {
  const expected = Buffer.from(signEnvelope(envelope, key), 'hex');
  const provided = Buffer.from(String(envelope?.authorization?.signature || ''), 'hex');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

function atomicWrite(file, payload) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  const handle = fs.openSync(temporary, 'w', 0o600);
  try {
    fs.writeFileSync(handle, payload);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temporary, file);
}

function seal(payload, key) {
  const body = stableStringify(payload);
  return JSON.stringify({ payload: body, mac: crypto.createHmac('sha256', key).update(body).digest('hex') });
}

function unseal(file, key) {
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof envelope?.payload !== 'string' || typeof envelope?.mac !== 'string') throw new Error('job_store_corrupt');
  const expected = crypto.createHmac('sha256', key).update(envelope.payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(envelope.mac, 'hex'), Buffer.from(expected, 'hex'))) throw new Error('job_store_integrity_failed');
  return JSON.parse(envelope.payload);
}

function jobStoreDirectory(env = process.env) {
  if (typeof env.ADS_JOB_PATH === 'string' && path.isAbsolute(env.ADS_JOB_PATH)) return env.ADS_JOB_PATH;
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (typeof mount === 'string' && path.isAbsolute(mount)) return path.join(mount, 'parma-ads-jobs');
  return null;
}

class UnattendedJobStore {
  constructor({ directory, integrityKey, now = Date.now }) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory === path.parse(directory).root) throw new Error('job_store_directory_invalid');
    if (!Buffer.isBuffer(integrityKey) || integrityKey.length < 32) throw new Error('job_store_key_invalid');
    if (typeof now !== 'function') throw new Error('job_store_clock_invalid');
    this.key = Buffer.from(integrityKey);
    this.now = now;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = fs.realpathSync(directory);
    this.incoming = path.join(this.directory, 'incoming');
    this.state = path.join(this.directory, 'state');
    this.results = path.join(this.directory, 'results');
    this.done = path.join(this.directory, 'done');
    this.quarantine = path.join(this.directory, 'quarantine');
    for (const dir of [this.incoming, this.state, this.results, this.done, this.quarantine]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  static fromEnv(env = process.env, options = {}) {
    const directory = jobStoreDirectory(env);
    if (!directory) throw new Error('job_store_directory_unavailable');
    return new UnattendedJobStore({ directory, integrityKey: jobIntegrityKey(env), now: options.now });
  }

  submit(envelope) {
    const parsed = envelopeSchema.safeParse(envelope);
    if (!parsed.success) throw new Error('invalid_job_envelope');
    const job = parsed.data;
    if (!verifyEnvelope(job, this.key)) throw new Error('job_signature_invalid');
    if (job.plan_digest !== planDigest(job.plan)) throw new Error('job_plan_digest_mismatch');
    if (job.authorization.customer_id !== String(job.plan?.customer_id || '')) throw new Error('job_customer_mismatch');
    const file = path.join(this.incoming, `${job.job_id}.json`);
    if (fs.existsSync(file)) throw new Error('job_already_submitted');
    atomicWrite(file, seal(job, this.key));
    return job;
  }

  listIncoming() {
    const entries = [];
    for (const name of fs.readdirSync(this.incoming).filter(candidate => candidate.endsWith('.json'))) {
      try {
        entries.push({ job: unseal(path.join(this.incoming, name), this.key), file: path.join(this.incoming, name) });
      } catch {
        // Unreadable job files are quarantined by the runner instead of wedging the queue.
      }
    }
    return entries.sort((a, b) => String(a.job.created_at).localeCompare(String(b.job.created_at)) || String(a.job.job_id).localeCompare(String(b.job.job_id)));
  }

  listCorruptFiles() {
    const corrupt = [];
    for (const name of fs.readdirSync(this.incoming).filter(candidate => candidate.endsWith('.json'))) {
      try {
        unseal(path.join(this.incoming, name), this.key);
      } catch {
        corrupt.push(path.join(this.incoming, name));
      }
    }
    return corrupt;
  }

  quarantineFile(file) {
    if (!fs.existsSync(file)) return false;
    fs.renameSync(file, path.join(this.quarantine, path.basename(file)));
    return true;
  }

  writeState(jobId, state) {
    const parsed = stateSchema.safeParse({ schema: 'google_ads.unattended_job_state.v1', job_id: jobId, updated_at: new Date(this.now()).toISOString(), ...state });
    if (!parsed.success) throw new Error('invalid_job_state');
    atomicWrite(path.join(this.state, `${jobId}.json`), seal(parsed.data, this.key));
    return parsed.data;
  }

  readState(jobId) {
    const file = path.join(this.state, `${jobId}.json`);
    if (!fs.existsSync(file)) return null;
    return stateSchema.parse(unseal(file, this.key));
  }

  writeResult(result) {
    const payload = { schema: 'google_ads.unattended_job_result.v1', updated_at: new Date(this.now()).toISOString(), ...result };
    const { signature, ...body } = payload;
    const sealed = { ...body, signature: crypto.createHmac('sha256', this.key).update(stableStringify(body)).digest('hex') };
    const parsed = resultSchema.safeParse(sealed);
    if (!parsed.success) throw new Error('invalid_job_result');
    atomicWrite(path.join(this.results, `${parsed.data.job_id}.json`), seal(parsed.data, this.key));
    return parsed.data;
  }

  readResult(jobId) {
    const file = path.join(this.results, `${jobId}.json`);
    if (!fs.existsSync(file)) return null;
    const payload = unseal(file, this.key);
    const { signature, ...body } = payload;
    const expected = crypto.createHmac('sha256', this.key).update(stableStringify(body)).digest('hex');
    if (signature !== expected) throw new Error('job_result_integrity_failed');
    return resultSchema.parse(payload);
  }

  archive(jobId) {
    const from = path.join(this.incoming, `${jobId}.json`);
    if (!fs.existsSync(from)) return false;
    fs.renameSync(from, path.join(this.done, `${jobId}.json`));
    return true;
  }
}

module.exports = { UnattendedJobStore, envelopeSchema, stateSchema, resultSchema, authorizationSchema, verifyEnvelope, signEnvelope, jobIntegrityKey, jobStoreDirectory, canonicalEnvelope };
