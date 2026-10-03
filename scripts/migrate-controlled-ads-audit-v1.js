'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stableStringify, canonicalJsonValue } = require('../ads-controlled-execution-core');

const EXPECTED_FAILURE = 'controlled_ads_store_hash_chain_broken:CHANGE_000253:record_hash';
const ALGORITHM = 'controlled-ads-audit-json-canonical-v1';
const sha256Text = value => crypto.createHash('sha256').update(value).digest('hex');
const recordHash = value => sha256Text(stableStringify(value));
const hmac = (key, payload) => crypto.createHmac('sha256', key).update(payload).digest('hex');

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function firstFailure(state) {
  let previousHash = recordHash('genesis');
  for (const record of state.records) {
    if (record.previous_hash !== previousHash) return `controlled_ads_store_hash_chain_broken:${record.id}:previous_hash`;
    const expected = recordHash({ id: record.id, kind: record.kind, created_at: record.created_at, previous_hash: record.previous_hash, payload: record.payload });
    if (record.hash !== expected) return `controlled_ads_store_hash_chain_broken:${record.id}:record_hash`;
    previousHash = record.hash;
  }
  return null;
}

function rebuild(state, metadata) {
  let previousHash = recordHash('genesis');
  const records = state.records.map(record => {
    const next = {
      id: record.id,
      kind: record.kind,
      created_at: record.created_at,
      previous_hash: previousHash,
      payload: canonicalJsonValue(record.payload),
    };
    next.hash = recordHash(next);
    previousHash = next.hash;
    return next;
  });
  const sequence = state.sequence + 1;
  const migration = {
    id: `AUDIT_${String(sequence).padStart(6, '0')}`,
    kind: 'audit',
    created_at: metadata.migrated_at,
    previous_hash: previousHash,
    payload: canonicalJsonValue({
      event: 'controlled_ads_audit_migrated_v1',
      algorithm: ALGORITHM,
      source_file_sha256: metadata.source_file_sha256,
      source_envelope_mac: metadata.source_envelope_mac,
      source_sequence: state.sequence,
      source_record_count: state.records.length,
      first_legacy_failure: EXPECTED_FAILURE,
      provider_write: false,
      writes_executed: 0,
    }),
  };
  migration.hash = recordHash(migration);
  records.push(migration);
  return { version: 1, sequence, records };
}

function main() {
  const apply = process.argv.includes('--apply');
  const base = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const secret = process.env.ADS_AUDIT_INTEGRITY_KEY || process.env.ADS_AUDIT_HMAC_KEY || process.env.PARMA_ADS_AUDIT_SECRET;
  if (!base || !path.isAbsolute(base)) throw new Error('audit_migration_volume_unavailable');
  if (!secret) throw new Error('audit_migration_integrity_secret_unavailable');
  if (process.env.GOOGLE_ADS_UNATTENDED_JOBS === 'enabled') throw new Error('audit_migration_unattended_jobs_must_be_disabled');

  const key = crypto.createHash('sha256').update(`parma-google-ads-commercial-audit-v1:${secret}`).digest();
  const directory = path.join(base, 'parma-ads-audit', 'google-ads-commercial');
  const active = path.join(directory, 'controlled-ads-audit.json');
  const original = fs.readFileSync(active);
  const sourceFileSha = crypto.createHash('sha256').update(original).digest('hex');
  const envelope = JSON.parse(original.toString('utf8'));
  if (typeof envelope.payload !== 'string' || typeof envelope.mac !== 'string') throw new Error('audit_migration_bad_envelope');
  const expectedMac = hmac(key, envelope.payload);
  if (!safeEqualHex(envelope.mac, expectedMac)) throw new Error('audit_migration_source_hmac_failed');

  const state = JSON.parse(envelope.payload);
  const failure = firstFailure(state);
  if (failure !== EXPECTED_FAILURE) throw new Error(`audit_migration_unexpected_failure:${failure || 'none'}`);

  const migratedAt = new Date().toISOString();
  const rebuilt = rebuild(state, { migrated_at: migratedAt, source_file_sha256: sourceFileSha, source_envelope_mac: envelope.mac });
  if (firstFailure(rebuilt) !== null) throw new Error('audit_migration_rebuilt_chain_invalid');
  const payload = JSON.stringify(rebuilt);
  const replacementEnvelope = JSON.stringify({ payload, mac: hmac(key, payload) });
  const parsedReplacement = JSON.parse(replacementEnvelope);
  if (!safeEqualHex(parsedReplacement.mac, hmac(key, parsedReplacement.payload)) || firstFailure(JSON.parse(parsedReplacement.payload)) !== null) {
    throw new Error('audit_migration_replacement_verification_failed');
  }

  const report = {
    status: apply ? 'READY_TO_APPLY' : 'DRY_RUN_VERIFIED',
    algorithm: ALGORITHM,
    expected_failure: EXPECTED_FAILURE,
    source_file_sha256: sourceFileSha,
    source_envelope_mac: envelope.mac,
    source_sequence: state.sequence,
    source_record_count: state.records.length,
    replacement_sequence: rebuilt.sequence,
    replacement_record_count: rebuilt.records.length,
    provider_write: false,
    writes_executed: 0,
  };
  if (!apply) return process.stdout.write(JSON.stringify(report) + '\n');

  const stamp = migratedAt.replace(/[:.]/g, '-');
  const evidence = path.join(directory, `controlled-ads-audit.legacy-${stamp}.json`);
  const manifest = path.join(directory, `controlled-ads-audit.migration-${stamp}.json`);
  const replacement = path.join(directory, `.controlled-ads-audit.migration-${stamp}.tmp`);
  for (const candidate of [evidence, manifest, replacement]) if (fs.existsSync(candidate)) throw new Error('audit_migration_artifact_collision');

  fs.writeFileSync(evidence, original, { mode: 0o400, flag: 'wx' });
  const copied = fs.readFileSync(evidence);
  if (!copied.equals(original)) throw new Error('audit_migration_evidence_copy_mismatch');

  const manifestValue = { ...report, status: 'APPLIED', migrated_at: migratedAt, evidence_file: path.basename(evidence), replacement_sha256: sha256Text(replacementEnvelope) };
  fs.writeFileSync(manifest, JSON.stringify(manifestValue, null, 2) + '\n', { mode: 0o400, flag: 'wx' });
  fs.writeFileSync(replacement, replacementEnvelope, { mode: 0o600, flag: 'wx' });
  const fd = fs.openSync(replacement, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(replacement, active);
  const dirFd = fs.openSync(directory, 'r'); try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  process.stdout.write(JSON.stringify(manifestValue) + '\n');
}

try { main(); } catch (error) {
  process.stderr.write(JSON.stringify({ status: 'BLOCKED', reason: error.message, provider_write: false, writes_executed: 0 }) + '\n');
  process.exitCode = 1;
}
