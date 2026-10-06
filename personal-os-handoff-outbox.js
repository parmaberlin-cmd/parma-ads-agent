'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');
const { assertPublicPayloadSafe } = require('./public-output-safety');

const ID = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const NON_EMPTY = z.string().min(1);
const STRING_LIST = z.array(z.string());
const NON_EMPTY_STRING_LIST = z.array(NON_EMPTY);

const testResultsSchema = z.object({
  overall: z.enum(['PASS', 'FAIL']),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  summary: z.string(),
}).strict();

const securityGateSchema = z.object({
  gate: NON_EMPTY,
  status: z.enum(['PASS', 'FAIL', 'NOT_APPLICABLE']),
  detail: z.string().optional(),
}).strict();

const approvalSchema = z.object({
  repository_config: z.boolean(),
  global_config_merge: z.boolean(),
  status: z.enum(['PASS', 'FAIL', 'NOT_APPLICABLE']),
  detail: z.string().optional(),
}).strict();

const canonicalHandoffSchema = z.object({
  handoff_id: NON_EMPTY.max(128),
  schema_version: z.literal('1.0'),
  phase: NON_EMPTY.max(128),
  goal: NON_EMPTY.max(4096),
  status: NON_EMPTY.max(128),
  architecture_decisions: NON_EMPTY_STRING_LIST.min(1),
  decisions_pending: STRING_LIST,
  workspace: NON_EMPTY,
  repository: NON_EMPTY.regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  branch: NON_EMPTY,
  head_commit: NON_EMPTY,
  files_created: NON_EMPTY_STRING_LIST,
  files_modified: NON_EMPTY_STRING_LIST,
  implemented: NON_EMPTY_STRING_LIST.min(1),
  tests_run: NON_EMPTY_STRING_LIST.min(1),
  test_results: testResultsSchema,
  security_gates: z.array(securityGateSchema).min(1),
  authority_state: NON_EMPTY,
  credential_boundaries: NON_EMPTY,
  human_interruption_policy: NON_EMPTY,
  autonomy_scope: NON_EMPTY,
  actions_requiring_human: NON_EMPTY_STRING_LIST.min(1),
  actions_allowed_autonomously: NON_EMPTY_STRING_LIST.min(1),
  approval_configuration_verified: approvalSchema,
  known_issues: STRING_LIST,
  blockers: STRING_LIST,
  last_completed_action: NON_EMPTY,
  current_action: NON_EMPTY,
  next_action: NON_EMPTY,
  commands_needed_to_continue: STRING_LIST,
  do_not_touch: STRING_LIST,
  rollback_information: NON_EMPTY,
  evidence: NON_EMPTY_STRING_LIST,
}).strict();

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function canonicalSignatureMessage(envelope) {
  return [
    'personal-os-handoff-v1',
    envelope.executor_id,
    envelope.key_id,
    envelope.issued_at,
    envelope.nonce,
    envelope.body_sha256,
  ].join('\n');
}

function publicSigningKey(signingKey) {
  return crypto.createPublicKey(signingKey).export({ type: 'spki', format: 'pem' });
}

function publicKeyFingerprint(publicKeyPem) {
  const key = publicKeyPem?.type === 'public' ? publicKeyPem : crypto.createPublicKey(publicKeyPem);
  const der = key.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex');
}

function outboxDirectory(env = process.env) {
  if (typeof env.PERSONAL_OS_HANDOFF_OUTBOX_PATH === 'string' && path.isAbsolute(env.PERSONAL_OS_HANDOFF_OUTBOX_PATH)) {
    return env.PERSONAL_OS_HANDOFF_OUTBOX_PATH;
  }
  if (typeof env.RAILWAY_VOLUME_MOUNT_PATH === 'string' && path.isAbsolute(env.RAILWAY_VOLUME_MOUNT_PATH)) {
    return path.join(env.RAILWAY_VOLUME_MOUNT_PATH, 'personal-os-handoffs');
  }
  return null;
}

function privateSigningKey(env = process.env) {
  const pem = env.PERSONAL_OS_HANDOFF_SIGNING_PRIVATE_KEY_PEM;
  if (typeof pem !== 'string' || !pem.includes('PRIVATE KEY')) throw new Error('handoff_signing_key_unavailable');
  let key;
  try {
    key = crypto.createPrivateKey(pem);
  } catch {
    throw new Error('handoff_signing_key_invalid');
  }
  if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') throw new Error('handoff_signing_key_invalid');
  return key;
}

function writeExclusiveAtomic(file, payload) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(handle, payload);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  try {
    fs.linkSync(temporary, file);
  } finally {
    fs.unlinkSync(temporary);
  }
}

class PersonalOsHandoffOutbox {
  constructor({ directory, executorId, keyId, signingKey, now = Date.now, nonce = crypto.randomUUID }) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || directory === path.parse(directory).root) {
      throw new Error('handoff_outbox_directory_invalid');
    }
    if (!ID.safeParse(executorId).success || !ID.safeParse(keyId).success) throw new Error('handoff_signer_identity_invalid');
    if (!signingKey || signingKey.type !== 'private' || signingKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('handoff_signing_key_invalid');
    }
    if (typeof now !== 'function' || typeof nonce !== 'function') throw new Error('handoff_signer_runtime_invalid');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = fs.realpathSync(directory);
    this.pending = path.join(this.directory, 'pending');
    fs.mkdirSync(this.pending, { recursive: true, mode: 0o700 });
    this.executorId = executorId;
    this.keyId = keyId;
    this.signingKey = signingKey;
    this.now = now;
    this.nonce = nonce;
  }

  static fromEnv(env = process.env, options = {}) {
    if (env.PERSONAL_OS_HANDOFF_OUTBOX_ENABLED !== 'true') return null;
    const directory = outboxDirectory(env);
    if (!directory) throw new Error('handoff_outbox_directory_unavailable');
    return new PersonalOsHandoffOutbox({
      directory,
      executorId: env.PERSONAL_OS_HANDOFF_EXECUTOR_ID,
      keyId: env.PERSONAL_OS_HANDOFF_KEY_ID,
      signingKey: privateSigningKey(env),
      now: options.now,
      nonce: options.nonce,
    });
  }

  submit(input) {
    const parsed = canonicalHandoffSchema.safeParse(input);
    if (!parsed.success) throw new Error('canonical_handoff_invalid');
    const handoff = parsed.data;
    try {
      assertPublicPayloadSafe(handoff);
    } catch {
      throw new Error('canonical_handoff_secret_material_detected');
    }
    const handoffDigest = digest(handoff);
    const file = path.join(this.pending, `${digest(handoff.handoff_id)}.json`);
    const record = {
      schema: 'personal_os.handoff_outbox.v1',
      handoff_digest: handoffDigest,
      stored_at: new Date(this.now()).toISOString(),
      handoff,
    };
    try {
      writeExclusiveAtomic(file, `${JSON.stringify(record)}\n`);
      return { status: 'QUEUED', handoff_id: handoff.handoff_id, handoff_digest: handoffDigest, duplicate: false };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw new Error('handoff_outbox_write_failed_closed');
      const existing = this.readRecord(file);
      if (existing.handoff_digest !== handoffDigest) throw new Error('handoff_id_content_conflict');
      return { status: 'QUEUED', handoff_id: handoff.handoff_id, handoff_digest: handoffDigest, duplicate: true };
    }
  }

  readRecord(file) {
    let record;
    try {
      record = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw new Error('handoff_outbox_integrity_failed');
    }
    if (record?.schema !== 'personal_os.handoff_outbox.v1') throw new Error('handoff_outbox_integrity_failed');
    const parsed = canonicalHandoffSchema.safeParse(record.handoff);
    if (!parsed.success || record.handoff_digest !== digest(parsed.data)) throw new Error('handoff_outbox_integrity_failed');
    try {
      assertPublicPayloadSafe(parsed.data);
    } catch {
      throw new Error('handoff_outbox_integrity_failed');
    }
    return { ...record, handoff: parsed.data };
  }

  sign(handoff) {
    const envelope = {
      schema_version: '1.0',
      executor_id: this.executorId,
      key_id: this.keyId,
      issued_at: new Date(this.now()).toISOString(),
      nonce: this.nonce(),
      body_sha256: digest(handoff),
      signature: '',
      handoff,
    };
    if (!ID.safeParse(envelope.nonce).success) throw new Error('handoff_nonce_invalid');
    envelope.signature = crypto.sign(
      null,
      Buffer.from(canonicalSignatureMessage(envelope), 'utf8'),
      this.signingKey,
    ).toString('base64');
    return envelope;
  }

  listSigned(limit = 20, { order = 'oldest' } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('handoff_list_limit_invalid');
    if (!['oldest', 'latest'].includes(order)) throw new Error('handoff_list_order_invalid');
    const records = fs.readdirSync(this.pending)
      .filter(name => /^[a-f0-9]{64}\.json$/.test(name))
      .map(name => this.readRecord(path.join(this.pending, name)))
      .sort((a, b) => String(a.stored_at).localeCompare(String(b.stored_at)) || a.handoff.handoff_id.localeCompare(b.handoff.handoff_id));
    if (order === 'latest') records.reverse();
    return records.slice(0, limit).map(record => this.sign(record.handoff));
  }

  signerMetadata() {
    const publicKeyPem = publicSigningKey(this.signingKey);
    return {
      executor_id: this.executorId,
      key_id: this.keyId,
      public_key_pem: publicKeyPem,
      fingerprint_sha256: publicKeyFingerprint(publicKeyPem),
    };
  }
}

module.exports = {
  PersonalOsHandoffOutbox,
  canonicalHandoffSchema,
  canonicalSignatureMessage,
  canonicalize,
  digest,
  outboxDirectory,
  privateSigningKey,
  publicKeyFingerprint,
  publicSigningKey,
};
