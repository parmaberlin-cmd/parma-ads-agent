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
  STORY_DISCOVERY_STATUS,
  discoverStories,
  buildStoryPublicationPackage,
  validateStoryPublication,
  executeStoryPublication,
} = require('../instagram-story-capability');

const FIXED_NOW = Date.parse('2026-09-08T12:00:00.000Z');
const now = () => FIXED_NOW;
const FUTURE = new Date(FIXED_NOW + 60 * 60 * 1000).toISOString();
const STABLE_URL = 'https://assets.parma.example/instagram-canary-assets/story-1.mp4';

function makeStore(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'story-capability-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new ControlledAdsStore({ directory: root, integrityKey: randomBytes(32), now });
}

function storyPackage(overrides = {}) {
  const authorization = buildInstagramCanaryAuthorization({
    username: 'parma.divinibenedetti',
    mediaUrl: STABLE_URL,
    mediaType: 'STORIES',
    caption: '',
    expiresAt: FUTURE,
    now,
  });
  return {
    publication_id: 'story-pub-1',
    username: 'parma.divinibenedetti',
    instagram_user_id: '17841463253292929',
    media_type: 'STORIES',
    media_url: STABLE_URL,
    caption: '',
    authorization,
    ...overrides,
  };
}

function loginTransport() {
  let publishCalls = 0;
  return {
    transport: {
      async get(endpoint) {
        if (endpoint === '/me') return { id: '17841463253292929', user_id: '17841463253292929', username: 'parma.divinibenedetti', account_type: 'BUSINESS', media_count: 108 };
        if (endpoint === '/me/media') return { data: [] };
        if (endpoint === '/me/insights') return { data: [] };
        if (endpoint === '/111') return { id: '111', status_code: 'FINISHED', status: 'FINISHED' };
        if (endpoint === '/222') return { id: '222', media_type: 'STORIES', media_product_type: 'STORIES', permalink: 'https://www.instagram.com/stories/parma-story/', timestamp: new Date(now()).toISOString(), username: 'parma.divinibenedetti' };
        if (endpoint === '/222/insights') return { data: [] };
        throw new Error(`unexpected get ${endpoint}`);
      },
      async post(endpoint) {
        if (endpoint === '/17841463253292929/media') return { id: '111' };
        if (endpoint === '/17841463253292929/media_publish') { publishCalls += 1; return { id: '222' }; }
        throw new Error(`unexpected post ${endpoint}`);
      },
    },
    getPublishCalls: () => publishCalls,
  };
}

test('official read path reports no currently discoverable Stories', async () => {
  const transport = {
    get: async endpoint => {
      if (endpoint === '/me') return { username: 'parma.divinibenedetti', account_type: 'BUSINESS', media_count: 108 };
      if (endpoint === '/me/media') return { data: [{ id: '1', media_type: 'VIDEO', media_product_type: 'REELS' }] };
      throw new Error('unexpected');
    },
  };
  const result = await discoverStories({ transport });
  assert.equal(result.status, STORY_DISCOVERY_STATUS.NOT_AVAILABLE_FROM_PROVIDER);
  assert.equal(result.stories_count, 0);
});

test('Story package rejects Reel package, caption, unsupported media, and signed URL', () => {
  assert.equal(buildStoryPublicationPackage(storyPackage()).ok, true);
  assert.equal(buildStoryPublicationPackage(storyPackage({ media_type: 'REELS' })).ok, false);
  assert.equal(buildStoryPublicationPackage(storyPackage({ caption: 'not allowed' })).ok, false);
  assert.equal(buildStoryPublicationPackage(storyPackage({ media_url: 'https://cdn.instagram.com/video.mp4?oh=signed' })).ok, false);
});

test('Story publication validates and executes through the existing controlled path exactly once', async t => {
  const store = makeStore(t);
  const f = loginTransport();
  const pkg = storyPackage();
  const validated = await validateStoryPublication({
    publicationPackage: pkg,
    env: {
      INSTAGRAM_ORGANIC_CANARY_ENABLED: 'true',
      INSTAGRAM_ORGANIC_KILL_SWITCH: 'false',
      INSTAGRAM_ORGANIC_AUDIT_INTEGRITY_KEY: '0123456789abcdef0123456789abcdef',
      INSTAGRAM_ORGANIC_AUDIT_PATH: store.directory,
    },
    store,
    transport: f.transport,
    loginTransport: f.transport,
    now,
    requireDurableMount: false,
  });
  assert.equal(validated.status, 'READY_FOR_PUBLICATION');
  assert.equal(validated.media_type, 'STORIES');

  const executed = await executeStoryPublication({
    publicationPackage: pkg,
    env: {
      INSTAGRAM_ORGANIC_CANARY_ENABLED: 'true',
      INSTAGRAM_ORGANIC_KILL_SWITCH: 'false',
      INSTAGRAM_ORGANIC_AUDIT_INTEGRITY_KEY: '0123456789abcdef0123456789abcdef',
      INSTAGRAM_ORGANIC_AUDIT_PATH: store.directory,
    },
    store,
    transport: f.transport,
    loginTransport: f.transport,
    now,
    requireDurableMount: false,
  });
  assert.equal(executed.status, 'INSTAGRAM_PUBLISH_VERIFIED');
  assert.equal(executed.media_type, 'STORIES');
  assert.equal(f.getPublishCalls(), 1);

  const duplicate = await executeStoryPublication({
    publicationPackage: pkg,
    env: {
      INSTAGRAM_ORGANIC_CANARY_ENABLED: 'true',
      INSTAGRAM_ORGANIC_KILL_SWITCH: 'false',
      INSTAGRAM_ORGANIC_AUDIT_INTEGRITY_KEY: '0123456789abcdef0123456789abcdef',
      INSTAGRAM_ORGANIC_AUDIT_PATH: store.directory,
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

test('Story and Reel domains remain isolated in package validation', () => {
  const story = storyPackage();
  assert.equal(story.media_type, 'STORIES');
  const reel = { ...story, media_type: 'REELS' };
  assert.equal(buildStoryPublicationPackage(reel).ok, false);
});
