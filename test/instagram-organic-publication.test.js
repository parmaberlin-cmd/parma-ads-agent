'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { ControlledAdsStore } = require('../ads-controlled-execution-core');
const { buildInstagramCanaryAuthorization } = require('../instagram-organic-canary');
const {
  validatePublicationPackage,
  validateInstagramPublication,
  executeInstagramPublication,
} = require('../instagram-organic-publication');

const FIXED_NOW = Date.parse('2026-09-08T12:00:00.000Z');
const now = () => FIXED_NOW;
const FUTURE = new Date(FIXED_NOW + 60 * 60 * 1000).toISOString();
const STABLE_URL = 'https://assets.parma.example/instagram-canary-assets/C9M7_b6MayR.mp4';

function makeStore(t, directory = null, key = randomBytes(32)) {
  const root = directory || fs.mkdtempSync(path.join(os.tmpdir(), 'publication-store-'));
  if (!directory) t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new ControlledAdsStore({ directory: root, integrityKey: key, now });
}

function packageFixture(overrides = {}) {
  const authorization = buildInstagramCanaryAuthorization({
    username: 'parma.divinibenedetti',
    mediaUrl: STABLE_URL,
    mediaType: 'REELS',
    caption: '',
    expiresAt: FUTURE,
    now,
  });
  return {
    publication_id: 'pub-canary-1',
    username: 'parma.divinibenedetti',
    instagram_user_id: '17841463253292929',
    media_type: 'REELS',
    media_url: STABLE_URL,
    caption: '',
    authorization,
    ...overrides,
  };
}

function loginTransport() {
  let publishCalls = 0;
  const transport = {
    async get(endpoint) {
      if (endpoint === '/me') return { id: '17841463253292929', user_id: '17841463253292929', username: 'parma.divinibenedetti', account_type: 'BUSINESS', media_count: 25 };
      if (endpoint === '/me/media') return { data: [] };
      if (endpoint === '/me/insights') return { data: [] };
      if (endpoint === '/111') return { id: '111', status_code: 'FINISHED', status: 'FINISHED' };
      if (endpoint === '/222') return { id: '222', media_type: 'REELS', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/parma-publication/', timestamp: new Date(now()).toISOString(), username: 'parma.divinibenedetti' };
      if (endpoint === '/222/insights') return { data: [] };
      throw new Error(`unexpected get ${endpoint}`);
    },
    async post(endpoint) {
      if (endpoint === '/17841463253292929/media') return { id: '111' };
      if (endpoint === '/17841463253292929/media_publish') { publishCalls += 1; return { id: '222' }; }
      throw new Error(`unexpected post ${endpoint}`);
    },
  };
  return { transport, getPublishCalls: () => publishCalls };
}

test('publication package rejects temporary or signed Instagram CDN URLs', () => {
  assert.equal(validatePublicationPackage(packageFixture(), { now }).ok, true);
  const signed = validatePublicationPackage(packageFixture({ media_url: 'https://scontent-ber1-1.cdninstagram.com/video.mp4?oh=signed' }), { now });
  assert.equal(signed.ok, false);
  assert.ok(signed.blockers.includes('stable_video_url_must_not_be_signed'));
  const missingAuth = validatePublicationPackage(packageFixture({ authorization: null }), { now });
  assert.equal(missingAuth.ok, false);
});

test('production publication validates, publishes once, and blocks duplicate execution', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-root-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = makeStore(t, root);
  const f = loginTransport();
  const pkg = packageFixture();
  const validated = await validateInstagramPublication({
    publicationPackage: pkg,
    env: {
      INSTAGRAM_ORGANIC_CANARY_ENABLED: 'true',
      INSTAGRAM_ORGANIC_KILL_SWITCH: 'false',
      INSTAGRAM_ORGANIC_AUDIT_INTEGRITY_KEY: '0123456789abcdef0123456789abcdef',
      INSTAGRAM_ORGANIC_AUDIT_PATH: root,
    },
    store,
    transport: f.transport,
    loginTransport: f.transport,
    now,
    requireDurableMount: false,
  });
  assert.equal(validated.status, 'READY_FOR_PUBLICATION');
  assert.equal(validated.interface, 'VALIDATE_PUBLICATION');

  const executed = await executeInstagramPublication({
    publicationPackage: pkg,
    env: {
      INSTAGRAM_ORGANIC_CANARY_ENABLED: 'true',
      INSTAGRAM_ORGANIC_KILL_SWITCH: 'false',
      INSTAGRAM_ORGANIC_AUDIT_INTEGRITY_KEY: '0123456789abcdef0123456789abcdef',
      INSTAGRAM_ORGANIC_AUDIT_PATH: root,
    },
    store,
    transport: f.transport,
    loginTransport: f.transport,
    now,
    requireDurableMount: false,
  });
  assert.equal(executed.status, 'INSTAGRAM_PUBLISH_VERIFIED');
  assert.equal(executed.interface, 'EXECUTE_PUBLICATION');
  assert.equal(f.getPublishCalls(), 1);

  const duplicate = await executeInstagramPublication({
    publicationPackage: pkg,
    env: {
      INSTAGRAM_ORGANIC_CANARY_ENABLED: 'true',
      INSTAGRAM_ORGANIC_KILL_SWITCH: 'false',
      INSTAGRAM_ORGANIC_AUDIT_INTEGRITY_KEY: '0123456789abcdef0123456789abcdef',
      INSTAGRAM_ORGANIC_AUDIT_PATH: root,
    },
    store,
    transport: f.transport,
    loginTransport: f.transport,
    now,
    requireDurableMount: false,
  });
  assert.equal(duplicate.status, 'BLOCKED');
  assert.ok(duplicate.blockers.includes('duplicate_publication_blocked'));
  assert.equal(f.getPublishCalls(), 1);
});

test('publication idempotency survives a fresh durable store instance', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publication-reopen-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const key = randomBytes(32);
  const store = makeStore(t, root, key);
  const pkg = packageFixture();
  const f = loginTransport();
  const env = {
    INSTAGRAM_ORGANIC_CANARY_ENABLED: 'true',
    INSTAGRAM_ORGANIC_KILL_SWITCH: 'false',
    INSTAGRAM_ORGANIC_AUDIT_INTEGRITY_KEY: '0123456789abcdef0123456789abcdef',
    INSTAGRAM_ORGANIC_AUDIT_PATH: root,
  };
  await executeInstagramPublication({
    publicationPackage: pkg,
    env,
    store,
    transport: f.transport,
    loginTransport: f.transport,
    now,
    requireDurableMount: false,
  });
  const reopened = makeStore(t, root, key);
  const duplicate = await validateInstagramPublication({
    publicationPackage: pkg,
    env,
    store: reopened,
    transport: f.transport,
    loginTransport: f.transport,
    now,
    requireDurableMount: false,
  });
  assert.equal(duplicate.status, 'BLOCKED');
  assert.ok(duplicate.blockers.includes('duplicate_publication_blocked'));
});
