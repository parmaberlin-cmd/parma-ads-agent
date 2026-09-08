'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { ControlledAdsStore } = require('../ads-controlled-execution-core');
const {
  EDITORIAL_READINESS_STATUS,
  berlinParts,
  isDstInBerlin,
  evaluateEditorialTiming,
  packageFingerprint,
  InstagramEditorialScheduler,
} = require('../instagram-editorial-timing');

let current = Date.parse('2026-09-08T10:00:00.000Z');
const now = () => current;

function makeStore(t, directory = null, key = randomBytes(32)) {
  const root = directory || fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-timing-'));
  if (!directory) t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new ControlledAdsStore({ directory: root, integrityKey: key, now });
}

function packageFixture(overrides = {}) {
  return {
    publication_id: 'pub-editorial-1',
    account: 'parma.divinibenedetti',
    content_fingerprint: 'content-hash-1',
    package_fingerprint: 'package-hash-1',
    timezone: 'Europe/Berlin',
    earliest_publish_at: '2026-09-08T11:00:00.000Z',
    preferred_publish_at: '2026-09-08T11:30:00.000Z',
    latest_publish_at: '2026-09-08T13:00:00.000Z',
    authorization_expires_at: '2026-09-08T14:00:00.000Z',
    ...overrides,
  };
}

test('before window returns WAIT and provider writes stay zero', () => {
  current = Date.parse('2026-09-08T10:00:00.000Z');
  const result = evaluateEditorialTiming({
    package: packageFixture(),
    technical_ready: true,
    editorial_ready: true,
    now,
  });
  assert.equal(result.status, EDITORIAL_READINESS_STATUS.WAIT_FOR_PUBLICATION_WINDOW);
  assert.equal(result.timing_ready, false);
  assert.equal(result.provider_writes_allowed, false);
});

test('inside window returns timing_ready', () => {
  current = Date.parse('2026-09-08T12:00:00.000Z');
  const result = evaluateEditorialTiming({
    package: packageFixture(),
    technical_ready: true,
    editorial_ready: true,
    now,
  });
  assert.equal(result.status, EDITORIAL_READINESS_STATUS.TIMING_READY);
  assert.equal(result.timing_ready, true);
  assert.equal(result.provider_writes_allowed, true);
});

test('after latest publish time returns expired with zero writes', () => {
  current = Date.parse('2026-09-08T13:00:01.000Z');
  const result = evaluateEditorialTiming({
    package: packageFixture(),
    technical_ready: true,
    editorial_ready: true,
    now,
  });
  assert.equal(result.status, EDITORIAL_READINESS_STATUS.PUBLICATION_WINDOW_EXPIRED);
  assert.equal(result.provider_writes_allowed, false);
});

test('Europe/Berlin wall-clock and DST offset are deterministic', () => {
  const winter = berlinParts('2026-01-15T12:00:00.000Z');
  const summer = berlinParts('2026-07-15T12:00:00.000Z');
  assert.equal(winter.offset, 'GMT+01:00');
  assert.equal(winter.hour, 13);
  assert.equal(summer.offset, 'GMT+02:00');
  assert.equal(summer.hour, 14);
  assert.equal(isDstInBerlin('2026-01-15T12:00:00.000Z'), false);
  assert.equal(isDstInBerlin('2026-07-15T12:00:00.000Z'), true);
});

test('authorization binds window and material changes invalidate fingerprint', () => {
  const pkg = packageFixture();
  const first = packageFingerprint(pkg);
  const changed = packageFingerprint({ ...pkg, earliest_publish_at: '2026-09-08T11:15:00.000Z' });
  assert.notEqual(first, changed);
  assert.notEqual(packageFingerprint({ ...pkg, account: 'other.account' }), first);
});

test('durable schedule survives restart and duplicate schedule is blocked', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-reopen-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const key = randomBytes(32);
  const store = makeStore(t, root, key);
  const scheduler = new InstagramEditorialScheduler({ store, now });
  const pkg = packageFixture();
  assert.equal(scheduler.schedule(pkg).status, 'SCHEDULED');

  const reopenedStore = makeStore(t, root, key);
  const reopened = new InstagramEditorialScheduler({ store: reopenedStore, now });
  assert.equal(reopened.schedule(pkg).status, 'DUPLICATE_SCHEDULE_BLOCKED');
});

test('duplicate and concurrent scheduler ticks cannot publish twice', async t => {
  const store = makeStore(t);
  const scheduler = new InstagramEditorialScheduler({ store, now });
  const pkg = packageFixture();
  scheduler.schedule(pkg);
  current = Date.parse('2026-09-08T12:00:00.000Z');
  let executions = 0;
  const execute = async () => {
    executions += 1;
    return { status: 'INSTAGRAM_PUBLISH_VERIFIED', provider_writes: 1 };
  };
  const first = await scheduler.tick({ technical_ready: true, editorial_ready: true, execute });
  assert.equal(first[0].status, 'INSTAGRAM_PUBLISH_VERIFIED');
  assert.equal(executions, 1);

  const second = await scheduler.tick({ technical_ready: true, editorial_ready: true, execute });
  assert.equal(second[0].status, 'DUPLICATE_EXECUTION_BLOCKED');
  assert.equal(executions, 1);

  const concurrent = new InstagramEditorialScheduler({ store, now });
  const third = await concurrent.tick({ technical_ready: true, editorial_ready: true, execute });
  assert.equal(third[0].status, 'DUPLICATE_EXECUTION_BLOCKED');
  assert.equal(executions, 1);
});

test('ambiguous provider result records reconciliation intent and never blind retries', async t => {
  const store = makeStore(t);
  const scheduler = new InstagramEditorialScheduler({ store, now });
  const pkg = packageFixture();
  scheduler.schedule(pkg);
  current = Date.parse('2026-09-08T12:00:00.000Z');
  let executions = 0;
  const execute = async () => {
    executions += 1;
    return { status: 'RECONCILIATION_REQUIRED', provider_writes: 1 };
  };
  const first = await scheduler.tick({ technical_ready: true, editorial_ready: true, execute });
  assert.equal(first[0].status, 'RECONCILIATION_REQUIRED');
  const second = await scheduler.tick({ technical_ready: true, editorial_ready: true, execute });
  assert.equal(second[0].status, 'DUPLICATE_EXECUTION_BLOCKED');
  assert.equal(executions, 1);
});

test('missing technical readiness blocks with zero provider writes', () => {
  current = Date.parse('2026-09-08T12:00:00.000Z');
  const result = evaluateEditorialTiming({
    package: packageFixture(),
    technical_ready: false,
    editorial_ready: true,
    now,
  });
  assert.equal(result.status, EDITORIAL_READINESS_STATUS.BLOCKED);
  assert.equal(result.provider_writes_allowed, false);
});

test('active scheduler wakes automatically and executes at most once', async t => {
  const store = makeStore(t);
  const scheduler = new InstagramEditorialScheduler({ store, now });
  const pkg = packageFixture();
  scheduler.schedule(pkg);
  current = Date.parse('2026-09-08T12:00:00.000Z');
  let executions = 0;
  const execute = async () => {
    executions += 1;
    return { status: 'INSTAGRAM_PUBLISH_VERIFIED', provider_writes: 1 };
  };
  scheduler.start({
    technical_ready: true,
    editorial_ready: true,
    execute,
    intervalMs: 10,
  });
  await new Promise(resolve => setTimeout(resolve, 45));
  scheduler.stop();
  assert.equal(executions, 1);
  assert.equal(scheduler.hasExecutionIntent(pkg), true);
});
