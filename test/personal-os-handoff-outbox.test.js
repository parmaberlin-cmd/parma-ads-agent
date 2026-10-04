'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  PersonalOsHandoffOutbox,
  canonicalSignatureMessage,
  digest,
  publicKeyFingerprint,
} = require('../personal-os-handoff-outbox');
const { installPersonalOsHandoffRoute } = require('../personal-os-handoff-route');

const NOW = Date.parse('2026-10-04T15:00:00.000Z');

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parma-personal-os-outbox-'));
}

function handoff(overrides = {}) {
  return {
    handoff_id: 'ADS-P1.52-TEST',
    schema_version: '1.0',
    phase: 'P1.52',
    goal: 'Transfer sanitized operational continuity to Personal OS.',
    status: 'READY_FOR_CONTINUATION',
    architecture_decisions: ['Personal OS remains the global control plane.'],
    decisions_pending: [],
    workspace: 'railway-runtime',
    repository: 'parmaberlin-cmd/parma-ads-agent',
    branch: 'main',
    head_commit: 'c0eb96d13e3f4466bf479322007ae9fddc3800b7',
    files_created: [],
    files_modified: ['personal-os-handoff-outbox.js'],
    implemented: ['Durable signed handoff outbox.'],
    tests_run: ['node --test'],
    test_results: { overall: 'PASS', passed: 1, failed: 0, summary: 'all tests passed' },
    security_gates: [{ gate: 'no-secrets', status: 'PASS' }],
    authority_state: 'No provider authority granted.',
    credential_boundaries: 'Signing material remains server-side.',
    human_interruption_policy: 'Interrupt on security-sensitive decisions.',
    autonomy_scope: 'Read-only continuity exchange only.',
    actions_requiring_human: ['Credential configuration.'],
    actions_allowed_autonomously: ['Read-only status transfer.'],
    approval_configuration_verified: {
      repository_config: true,
      global_config_merge: false,
      status: 'PASS',
    },
    known_issues: [],
    blockers: [],
    last_completed_action: 'Created a sanitized handoff.',
    current_action: 'Queue the handoff.',
    next_action: 'Esegui i test del repository.',
    commands_needed_to_continue: ['npm test'],
    do_not_touch: ['Google Ads', 'Meta', 'budgets', 'publishing'],
    rollback_information: 'Remove the queued local record.',
    evidence: ['CI test report'],
    ...overrides,
  };
}

function setup(options = {}) {
  const directory = temporaryDirectory();
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const outbox = new PersonalOsHandoffOutbox({
    directory,
    executorId: 'parma-ads-agent',
    keyId: 'test-key-1',
    signingKey: privateKey,
    now: () => NOW,
    nonce: () => options.nonce || 'nonce-00000001',
  });
  return { directory, outbox, privateKey, publicKey };
}

function responseCapture() {
  const output = { status: 200, body: null, headers: {} };
  return {
    output,
    set(headers) { Object.assign(output.headers, headers); return this; },
    status(code) { output.status = code; return this; },
    json(payload) { output.body = payload; return this; },
  };
}

test('disabled configuration performs no filesystem mutation', () => {
  const directory = path.join(temporaryDirectory(), 'must-not-exist');
  const outbox = PersonalOsHandoffOutbox.fromEnv({
    PERSONAL_OS_HANDOFF_OUTBOX_ENABLED: 'false',
    PERSONAL_OS_HANDOFF_OUTBOX_PATH: directory,
  });
  assert.equal(outbox, null);
  assert.equal(fs.existsSync(directory), false);
});

test('stores a canonical handoff and emits a receiver-compatible Ed25519 envelope', () => {
  const { directory, outbox, publicKey } = setup();
  const input = handoff();
  const queued = outbox.submit(input);
  const [envelope] = outbox.listSigned();
  assert.equal(queued.status, 'QUEUED');
  assert.equal(queued.duplicate, false);
  assert.equal(envelope.body_sha256, digest(input));
  assert.equal(envelope.issued_at, '2026-10-04T15:00:00.000Z');
  assert.equal(crypto.verify(
    null,
    Buffer.from(canonicalSignatureMessage(envelope), 'utf8'),
    publicKey,
    Buffer.from(envelope.signature, 'base64'),
  ), true);
  assert.doesNotMatch(JSON.stringify(envelope), /BEGIN PRIVATE KEY/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('exposes only stable public signer discovery metadata', () => {
  const { directory, outbox, publicKey } = setup();
  const metadata = outbox.signerMetadata();
  assert.equal(metadata.executor_id, 'parma-ads-agent');
  assert.equal(metadata.key_id, 'test-key-1');
  assert.match(metadata.public_key_pem, /^-----BEGIN PUBLIC KEY-----/);
  assert.equal(metadata.fingerprint_sha256, publicKeyFingerprint(publicKey));
  assert.doesNotMatch(JSON.stringify(metadata), /PRIVATE KEY/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('idempotent resubmission is accepted and conflicting content is rejected', () => {
  const { directory, outbox } = setup();
  assert.equal(outbox.submit(handoff()).duplicate, false);
  assert.equal(outbox.submit(handoff()).duplicate, true);
  assert.throws(
    () => outbox.submit(handoff({ next_action: 'Different action.' })),
    /handoff_id_content_conflict/,
  );
  assert.equal(outbox.listSigned().length, 1);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('rejects unknown fields and credential-like material before persistence', () => {
  for (const input of [
    handoff({ unexpected_authority: true }),
    handoff({ evidence: ['Bearer abcdefghijklmnopqrstuvwxyz123456'] }),
  ]) {
    const { directory, outbox } = setup();
    assert.throws(() => outbox.submit(input), /canonical_handoff_(?:invalid|secret_material_detected)/);
    assert.deepEqual(fs.readdirSync(path.join(directory, 'pending')), []);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('fails closed when a durable record is tampered with', () => {
  const { directory, outbox } = setup();
  outbox.submit(handoff());
  const [name] = fs.readdirSync(path.join(directory, 'pending'));
  const file = path.join(directory, 'pending', name);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  record.handoff.next_action = 'tampered';
  fs.writeFileSync(file, JSON.stringify(record));
  assert.throws(() => outbox.listSigned(), /handoff_outbox_integrity_failed/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('fromEnv requires a durable path and a valid Ed25519 private key only when enabled', () => {
  assert.throws(
    () => PersonalOsHandoffOutbox.fromEnv({ PERSONAL_OS_HANDOFF_OUTBOX_ENABLED: 'true' }),
    /handoff_outbox_directory_unavailable/,
  );
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const directory = temporaryDirectory();
  assert.throws(() => PersonalOsHandoffOutbox.fromEnv({
    PERSONAL_OS_HANDOFF_OUTBOX_ENABLED: 'true',
    PERSONAL_OS_HANDOFF_OUTBOX_PATH: directory,
    PERSONAL_OS_HANDOFF_EXECUTOR_ID: 'parma-ads-agent',
    PERSONAL_OS_HANDOFF_KEY_ID: 'test-key-1',
    PERSONAL_OS_HANDOFF_SIGNING_PRIVATE_KEY_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }), /handoff_signing_key_invalid/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('authenticated route is read-only, no-store and blocked by default', () => {
  const registrations = [];
  const requireApiKey = () => {};
  const app = { get(...args) { registrations.push(args); } };
  installPersonalOsHandoffRoute({ app, requireApiKey, env: {} });
  const [route, middleware, handler] = registrations[0];
  const registration = { route, middleware, handler };
  assert.equal(registration.route, '/control/personal-os/handoffs');
  assert.equal(registration.middleware, requireApiKey);
  const res = responseCapture();
  registration.handler({ query: {} }, res);
  assert.equal(res.output.status, 503);
  assert.equal(res.output.body.blocker, 'personal_os_handoff_outbox_disabled');
  assert.equal(res.output.body.provider_writes, 0);
  assert.equal(res.output.body.spend_changed, false);
  assert.equal(res.output.body.published, false);
  assert.equal(res.output.headers['Cache-Control'], 'no-store');
});

test('route returns fresh signed handoffs and never exposes signing material', () => {
  const directory = temporaryDirectory();
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const env = {
    PERSONAL_OS_HANDOFF_OUTBOX_ENABLED: 'true',
    PERSONAL_OS_HANDOFF_OUTBOX_PATH: directory,
    PERSONAL_OS_HANDOFF_EXECUTOR_ID: 'parma-ads-agent',
    PERSONAL_OS_HANDOFF_KEY_ID: 'test-key-1',
    PERSONAL_OS_HANDOFF_SIGNING_PRIVATE_KEY_PEM: pem,
  };
  PersonalOsHandoffOutbox.fromEnv(env, { now: () => NOW, nonce: () => 'nonce-for-submit' }).submit(handoff());
  const registrations = [];
  const app = { get(...args) { registrations.push(args); } };
  installPersonalOsHandoffRoute({
    app,
    requireApiKey: (_req, _res, next) => next(),
    env,
    now: () => NOW + 1000,
    nonce: () => 'nonce-for-read',
  });
  const handler = registrations.find(args => args[0] === '/control/personal-os/handoffs')[2];
  const res = responseCapture();
  handler({ query: { limit: '1' } }, res);
  assert.equal(res.output.status, 200);
  assert.equal(res.output.body.count, 1);
  assert.equal(res.output.body.handoffs[0].issued_at, '2026-10-04T15:00:01.000Z');
  assert.equal(res.output.body.handoffs[0].nonce, 'nonce-for-read');
  assert.doesNotMatch(JSON.stringify(res.output.body), /BEGIN PRIVATE KEY|failed:\s|Error:/);
  assert.equal(res.output.body.provider_writes, 0);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('public route is unauthenticated but signed, sanitized and read-only', () => {
  const directory = temporaryDirectory();
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const env = {
    PERSONAL_OS_HANDOFF_OUTBOX_ENABLED: 'true',
    PERSONAL_OS_HANDOFF_OUTBOX_PATH: directory,
    PERSONAL_OS_HANDOFF_EXECUTOR_ID: 'parma-ads-agent',
    PERSONAL_OS_HANDOFF_KEY_ID: 'test-key-1',
    PERSONAL_OS_HANDOFF_SIGNING_PRIVATE_KEY_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  PersonalOsHandoffOutbox.fromEnv(env, { now: () => NOW, nonce: () => 'nonce-for-submit' }).submit(handoff());
  const registrations = [];
  installPersonalOsHandoffRoute({
    app: { get(...args) { registrations.push(args); } },
    requireApiKey: () => {},
    env,
    now: () => NOW + 1000,
    nonce: () => 'nonce-public-read',
  });
  const registration = registrations.find(args => args[0] === '/control/personal-os/handoffs/public');
  assert.equal(registration.length, 2);
  const res = responseCapture();
  registration[1]({ query: { limit: '1' } }, res);
  assert.equal(res.output.status, 200);
  assert.equal(res.output.body.count, 1);
  assert.equal(res.output.body.signer.executor_id, 'parma-ads-agent');
  assert.match(res.output.body.signer.public_key_pem, /^-----BEGIN PUBLIC KEY-----/);
  assert.doesNotMatch(JSON.stringify(res.output.body), /BEGIN PRIVATE KEY|Bearer|api_key/i);
  assert.equal(res.output.body.authority_granted, false);
  fs.rmSync(directory, { recursive: true, force: true });
});
