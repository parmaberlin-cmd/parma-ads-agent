'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { ControlledAdsStore } = require('../ads-controlled-execution-core');
const {
  PUBLICATION_STATES,
  latestPublicationState,
  currentPublicationState,
  markPublicationState,
  derivePublicationState,
  canRetryPublicationState,
  providerWritesAllowed,
  frozenProviderResult,
} = require('../instagram-publication-state');

function makeStore(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-state-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new ControlledAdsStore({
    directory: root,
    integrityKey: randomBytes(32),
    now: () => Date.parse('2026-09-11T10:00:00.000Z'),
  });
}

test('state transitions persist and latest state is durable across reopen', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-state-reopen-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const key = randomBytes(32);
  const store = new ControlledAdsStore({ directory: root, integrityKey: key, now: () => Date.parse('2026-09-11T10:00:00.000Z') });
  markPublicationState(store, {
    publicationId: 'story-canary-20260911-1',
    status: PUBLICATION_STATES.SCHEDULED,
    reason: 'editorial_schedule_created',
  });
  markPublicationState(store, {
    publicationId: 'story-canary-20260911-1',
    status: PUBLICATION_STATES.DISPATCHED,
    reason: 'editorial_execution_dispatch',
  });
  const reopened = new ControlledAdsStore({ directory: root, integrityKey: key, now: () => Date.parse('2026-09-11T10:01:00.000Z') });
  assert.equal(latestPublicationState(reopened, 'story-canary-20260911-1').status, PUBLICATION_STATES.DISPATCHED);
});

test('current state infers verified and ambiguous history when no explicit state record exists', t => {
  const store = makeStore(t);
  store.append('change', {
    publication_id: 'verified-without-state',
    status: 'INSTAGRAM_PUBLISH_VERIFIED',
    real_instagram_publication_attempted: true,
  });
  store.append('change', {
    publication_id: 'ambiguous-without-state',
    status: 'BLOCKED',
    real_instagram_publication_attempted: true,
  });
  assert.equal(currentPublicationState(store, 'verified-without-state').status, PUBLICATION_STATES.VERIFIED_LIVE);
  assert.equal(currentPublicationState(store, 'ambiguous-without-state').status, PUBLICATION_STATES.AMBIGUOUS);
});

test('derives ambiguous, failed and verified states from execution results', () => {
  assert.equal(derivePublicationState({ status: 'INSTAGRAM_PUBLISH_VERIFIED' }), PUBLICATION_STATES.VERIFIED_LIVE);
  assert.equal(derivePublicationState({ status: 'RECONCILIATION_REQUIRED' }), PUBLICATION_STATES.AMBIGUOUS);
  assert.equal(derivePublicationState({ status: 'BLOCKED', real_instagram_publication_attempted: false }), PUBLICATION_STATES.FAILED);
  assert.equal(derivePublicationState({ status: 'BLOCKED', real_instagram_publication_attempted: true }), PUBLICATION_STATES.AMBIGUOUS);
});

test('failed state retries only when the reason is retryable', () => {
  const now = () => Date.parse('2026-09-11T10:00:00.000Z');
  assert.equal(canRetryPublicationState({ status: PUBLICATION_STATES.FAILED, reason: 'transient_graph_error' }, now), true);
  assert.equal(canRetryPublicationState({ status: PUBLICATION_STATES.FAILED, reason: 'duplicate_publication_blocked' }, now), false);
  assert.equal(canRetryPublicationState({ status: PUBLICATION_STATES.FAILED, reason: 'x', retry_after: '2026-09-11T10:05:00.000Z' }, now), false);
});

test('provider writes are frozen unless explicitly enabled', () => {
  assert.equal(providerWritesAllowed({}), false);
  assert.equal(providerWritesAllowed({ INSTAGRAM_PROVIDER_WRITES: '0' }), false);
  assert.equal(providerWritesAllowed({ INSTAGRAM_PROVIDER_WRITES: '1' }), true);
  const frozen = frozenProviderResult({ publication_id: 'story-canary-20260911-1' });
  assert.equal(frozen.real_instagram_publication_attempted, false);
  assert.equal(frozen.writes_executed, 0);
  assert.deepEqual(frozen.blockers, ['provider_writes_frozen']);
});
