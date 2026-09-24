'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { executeScheduledInstagramPublish, scheduledPackage } = require('../instagram-runtime-publish');

const NOW = Date.parse('2026-09-24T16:15:00Z');
const now = () => NOW;

function packageFixture() {
  const pkg = {
    publication_id: 'approved-story-1',
    account: 'parma.divinibenedetti',
    username: 'parma.divinibenedetti',
    instagram_user_id: '17841463253292929',
    media_type: 'STORIES',
    content_type: 'STORIES',
    media_url: 'https://assets.parma.example/instagram-canary-assets/story-approved.mp4',
    asset_sha256: 'a'.repeat(64),
    caption: '',
    timezone: 'Europe/Berlin',
    earliest_publish_at: '2026-09-24T18:00:00+02:00',
    preferred_publish_at: '2026-09-24T18:15:00+02:00',
    latest_publish_at: '2026-09-24T19:00:00+02:00',
    authorization_expires_at: '2026-09-24T19:30:00+02:00',
  };
  const { approvalFingerprint } = require('../instagram-package-ingress');
  const fingerprint = approvalFingerprint(pkg);
  const { buildInstagramCanaryAuthorization } = require('../instagram-organic-canary');
  pkg.content_fingerprint = fingerprint;
  pkg.authorization = {
    ...buildInstagramCanaryAuthorization({
      username: pkg.username,
      mediaUrl: pkg.media_url,
      mediaType: pkg.media_type,
      caption: pkg.caption,
      expiresAt: pkg.authorization_expires_at,
      now,
    }),
    package_fingerprint: fingerprint,
    publish_once: true,
  };
  return pkg;
}

function storeWith(pkg) {
  return {
    list(kind) {
      if (kind !== 'change') return [];
      return [{
        payload: {
          kind_event: 'instagram_editorial_schedule_created',
          publication_id: pkg.publication_id,
          serialized_package: Buffer.from(JSON.stringify(pkg)).toString('base64'),
        },
      }];
    },
  };
}

test('runtime publish loads only the immutable scheduled package by id', () => {
  const pkg = packageFixture();
  assert.deepEqual(scheduledPackage(storeWith(pkg), pkg.publication_id), pkg);
  assert.equal(scheduledPackage(storeWith(pkg), 'other'), null);
});

test('runtime publish fails closed for kill switch, frozen writes and missing schedule', async () => {
  const pkg = packageFixture();
  let calls = 0;
  const execute = async () => { calls += 1; };
  assert.equal((await executeScheduledInstagramPublish({ env:{INSTAGRAM_PROVIDER_WRITES:'1'},store:storeWith(pkg),publicationId:pkg.publication_id,runtimeKillSwitch:true,now,execute })).evidence.blockers[0], 'runtime_kill_switch_active');
  assert.equal((await executeScheduledInstagramPublish({ env:{INSTAGRAM_PROVIDER_WRITES:'0'},store:storeWith(pkg),publicationId:pkg.publication_id,now,execute })).evidence.blockers[0], 'provider_writes_frozen');
  assert.equal((await executeScheduledInstagramPublish({ env:{INSTAGRAM_PROVIDER_WRITES:'1'},store:{list:()=>[]},publicationId:pkg.publication_id,now,execute })).evidence.blockers[0], 'scheduled_publication_package_not_found');
  assert.equal(calls, 0);
});

test('runtime publish executes once only after all gates and returns provider evidence', async () => {
  const pkg = packageFixture();
  let calls = 0;
  const result = await executeScheduledInstagramPublish({
    env:{INSTAGRAM_PROVIDER_WRITES:'1'},
    store:storeWith(pkg),
    publicationId:pkg.publication_id,
    now,
    execute: async received => {
      calls += 1;
      assert.deepEqual(received, pkg);
      return { status:'INSTAGRAM_PUBLISH_VERIFIED', verification_result:true, instagram_media_id:'222', container_id:'111', permalink:null, writes_executed:1 };
    },
  });
  assert.equal(result.validated, true);
  assert.equal(result.evidence.verification_result, true);
  assert.equal(result.evidence.instagram_media_id, '222');
  assert.equal(calls, 1);
});
