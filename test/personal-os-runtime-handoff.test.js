'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  PersonalOsHandoffOutbox,
  canonicalHandoffSchema,
} = require('../personal-os-handoff-outbox');
const {
  buildRuntimeHandoff,
  emitTerminalRuntimeHandoffs,
  producerFailureCategory,
} = require('../personal-os-runtime-handoff');

function objective(status = 'DONE', overrides = {}) {
  return {
    id: 'objective-safe-1',
    objective: 'A raw objective that must not be copied.',
    status,
    stop_reason: status === 'DONE' ? 'objective_verified' : 'provider_or_capability_blocked',
    created_at: '2026-10-04T15:00:00.000Z',
    updated_at: '2026-10-04T15:02:00.000Z',
    completed_at: status === 'DONE' ? '2026-10-04T15:02:00.000Z' : null,
    tasks: [
      {
        id: 'task-safe-1',
        kind: 'run_diagnostics',
        status: status === 'DONE' ? 'DONE' : status,
        evidence: [{ api_key: '[redacted]', provider_payload: 'must-not-be-copied' }],
      },
    ],
    ...overrides,
  };
}

function realOutbox() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parma-runtime-handoff-'));
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    directory,
    outbox: new PersonalOsHandoffOutbox({
      directory,
      executorId: 'parma-ads-agent',
      keyId: 'test-key-1',
      signingKey: privateKey,
      now: () => Date.parse('2026-10-04T15:03:00.000Z'),
      nonce: () => 'nonce-runtime-test',
    }),
  };
}

test('builds a strict canonical DONE handoff without copying raw runtime evidence', () => {
  const handoff = buildRuntimeHandoff(objective(), {
    RAILWAY_GIT_BRANCH: 'main',
    RAILWAY_GIT_COMMIT_SHA: 'e6a16b036d7ff9076d29615b0fd33d302171d888',
  });
  assert.equal(canonicalHandoffSchema.safeParse(handoff).success, true);
  assert.equal(handoff.status, 'DONE');
  assert.equal(handoff.test_results.overall, 'PASS');
  assert.equal(handoff.next_action, 'Mostra lo stato della coda.');
  assert.match(handoff.handoff_id, /^ADS-RUNTIME-[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(handoff), /must-not-be-copied|api_key|provider_payload|raw objective/i);
});

test('preserves NEEDS_HUMAN and BLOCKED_EXTERNAL as failures instead of PASS', () => {
  for (const status of ['NEEDS_HUMAN', 'BLOCKED_EXTERNAL']) {
    const handoff = buildRuntimeHandoff(objective(status));
    assert.equal(handoff.status, status);
    assert.equal(handoff.test_results.overall, 'FAIL');
    assert.ok(handoff.test_results.failed >= 1);
    assert.notEqual(handoff.next_action, 'Mostra lo stato della coda.');
    assert.equal(handoff.authority_granted, undefined);
  }
});

test('handoff identity is deterministic per terminal transition', () => {
  const first = buildRuntimeHandoff(objective());
  const same = buildRuntimeHandoff(objective());
  const resumed = buildRuntimeHandoff(objective('DONE', {
    updated_at: '2026-10-04T16:00:00.000Z',
    completed_at: '2026-10-04T16:00:00.000Z',
  }));
  assert.equal(first.handoff_id, same.handoff_id);
  assert.notEqual(first.handoff_id, resumed.handoff_id);
});

test('deployment metadata changes produce a new content-addressed handoff id', () => {
  const first = buildRuntimeHandoff(objective(), {
    RAILWAY_GIT_BRANCH: 'main',
    RAILWAY_GIT_COMMIT_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  const redeployed = buildRuntimeHandoff(objective(), {
    RAILWAY_GIT_BRANCH: 'main',
    RAILWAY_GIT_COMMIT_SHA: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  assert.notEqual(first.head_commit, redeployed.head_commit);
  assert.notEqual(first.handoff_id, redeployed.handoff_id);

  const { directory, outbox } = realOutbox();
  assert.equal(outbox.submit(first).duplicate, false);
  assert.equal(outbox.submit(redeployed).duplicate, false);
  assert.equal(outbox.listSigned().length, 2);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('disabled producer is inert and does not require runtime state', () => {
  const result = emitTerminalRuntimeHandoffs({ env: {} });
  assert.deepEqual(result, {
    status: 'BLOCKED',
    reason: 'personal_os_handoff_outbox_disabled',
    queued: 0,
    duplicates: 0,
  });
});

test('queues terminal objectives idempotently and ignores active objectives', () => {
  const { directory, outbox } = realOutbox();
  const state = {
    objectives: [
      objective('DONE'),
      objective('READY', { id: 'objective-active', tasks: [] }),
      objective('BLOCKED_EXTERNAL', { id: 'objective-blocked' }),
    ],
  };
  const first = emitTerminalRuntimeHandoffs({ state, outbox });
  const second = emitTerminalRuntimeHandoffs({ state, outbox });
  assert.equal(first.status, 'EMITTED');
  assert.equal(first.queued, 2);
  assert.equal(first.duplicates, 0);
  assert.equal(second.queued, 0);
  assert.equal(second.duplicates, 2);
  assert.equal(outbox.listSigned().length, 2);
  assert.equal(first.provider_writes, 0);
  assert.equal(first.spend_changed, false);
  assert.equal(first.published, false);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('invalid repository metadata falls back to safe non-secret values', () => {
  const handoff = buildRuntimeHandoff(objective(), {
    RAILWAY_GIT_BRANCH: 'main\nBearer secret-secret-secret',
    RAILWAY_GIT_COMMIT_SHA: 'not-a-commit',
  });
  assert.equal(handoff.branch, 'main');
  assert.equal(handoff.head_commit, 'runtime-head-unavailable');
  assert.doesNotMatch(JSON.stringify(handoff), /Bearer|secret-secret/);
});

test('producer errors expose only allowlisted categories', () => {
  assert.equal(
    producerFailureCategory(new Error('handoff_signing_key_unavailable')),
    'handoff_signing_key_unavailable',
  );
  const raw = new Error('Bearer secret-secret-secret https://provider.example/token');
  assert.equal(producerFailureCategory(raw), 'personal_os_runtime_handoff_failed_closed');
});
