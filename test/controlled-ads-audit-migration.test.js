'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { stableStringify } = require('../ads-controlled-execution-core');

const script = path.join(__dirname, '..', 'scripts', 'migrate-controlled-ads-audit-v1.js');
const hash = value => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-migration-'));
  const dir = path.join(root, 'parma-ads-audit', 'google-ads-commercial');
  fs.mkdirSync(dir, { recursive: true });
  const secret = 'migration-test-secret';
  const key = crypto.createHash('sha256').update(`parma-google-ads-commercial-audit-v1:${secret}`).digest();
  let prev = hash('genesis');
  const records = [];
  for (let i = 1; i <= 252; i += 1) {
    const kind = 'audit', id = `AUDIT_${String(i).padStart(6, '0')}`;
    const record = { id, kind, created_at: '2026-10-03T15:38:00.000Z', previous_hash: prev, payload: { n: i } };
    record.hash = hash(record); prev = record.hash; records.push(record);
  }
  // Reproduce the legacy defect: hash was calculated while an undefined object
  // property existed; JSON persistence then dropped that property.
  const broken = { id: 'CHANGE_000253', kind: 'change', created_at: '2026-10-03T15:38:05.853Z', previous_hash: prev, payload: { change_id: 'v5-mon', read_after_write: { verified: false, actual: undefined } } };
  broken.hash = hash(broken);
  const state = { version: 1, sequence: 253, records };
  state.records.push(broken);
  const payload = JSON.stringify(state);
  const mac = crypto.createHmac('sha256', key).update(payload).digest('hex');
  fs.writeFileSync(path.join(dir, 'controlled-ads-audit.json'), JSON.stringify({ payload, mac }));
  return { root, dir, secret };
}

function run(f, args = [], extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, RAILWAY_VOLUME_MOUNT_PATH: f.root, PARMA_ADS_AUDIT_SECRET: f.secret, GOOGLE_ADS_UNATTENDED_JOBS: 'disabled', ...extraEnv } });
}

test('migration dry-run verifies expected legacy break without changing source bytes', t => {
  const f=fixture(); t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
  const active=path.join(f.dir,'controlled-ads-audit.json'); const before=fs.readFileSync(active);
  const r=run(f); assert.equal(r.status,0,r.stderr); assert.equal(JSON.parse(r.stdout).status,'DRY_RUN_VERIFIED');
  assert.deepEqual(fs.readFileSync(active),before);
  assert.deepEqual(fs.readdirSync(f.dir),['controlled-ads-audit.json']);
});

test('migration apply preserves exact evidence and installs a valid replacement', t => {
  const f=fixture(); t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
  const active=path.join(f.dir,'controlled-ads-audit.json'); const before=fs.readFileSync(active);
  const r=run(f,['--apply']); assert.equal(r.status,0,r.stderr); const out=JSON.parse(r.stdout); assert.equal(out.status,'APPLIED');
  const evidence=fs.readFileSync(path.join(f.dir,out.evidence_file)); assert.deepEqual(evidence,before);
  const envelope=JSON.parse(fs.readFileSync(active,'utf8')); const state=JSON.parse(envelope.payload);
  assert.equal(state.sequence,254); assert.equal(state.records.at(-1).payload.event,'controlled_ads_audit_migrated_v1');
  let prev=hash('genesis'); for(const rec of state.records){ assert.equal(rec.previous_hash,prev); assert.equal(rec.hash,hash({ id: rec.id, kind: rec.kind, created_at: rec.created_at, previous_hash: rec.previous_hash, payload: rec.payload })); prev=rec.hash; }
});

test('migration fails closed while unattended worker is enabled', t => {
  const f=fixture(); t.after(()=>fs.rmSync(f.root,{recursive:true,force:true}));
  const active=path.join(f.dir,'controlled-ads-audit.json'); const before=fs.readFileSync(active);
  const r=run(f,['--apply'],{GOOGLE_ADS_UNATTENDED_JOBS:'enabled'});
  assert.notEqual(r.status,0); assert.match(r.stderr,/audit_migration_unattended_jobs_must_be_disabled/); assert.deepEqual(fs.readFileSync(active),before);
});
