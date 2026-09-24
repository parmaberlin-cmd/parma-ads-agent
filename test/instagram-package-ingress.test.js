'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInstagramCanaryAuthorization } = require('../instagram-organic-canary');
const {
  approvalFingerprint,
  validatePublishingPackageIngress,
  scheduleApprovedPublishingPackage,
} = require('../instagram-package-ingress');

const NOW = Date.parse('2026-09-24T16:00:00Z');
const now = () => NOW;
const mediaUrl = 'https://assets.parma.example/instagram-canary-assets/story-approved.mp4';

function pkg(overrides = {}) {
  const base = {
    publication_id: 'story-approved-1',
    account: 'parma.divinibenedetti',
    username: 'parma.divinibenedetti',
    instagram_user_id: '17841463253292929',
    media_type: 'STORIES',
    content_type: 'STORIES',
    media_url: mediaUrl,
    asset_sha256: 'a'.repeat(64),
    caption: '',
    timezone: 'Europe/Berlin',
    earliest_publish_at: '2026-09-24T18:00:00+02:00',
    preferred_publish_at: '2026-09-24T18:15:00+02:00',
    latest_publish_at: '2026-09-24T19:00:00+02:00',
    authorization_expires_at: '2026-09-24T19:30:00+02:00',
  };
  const fingerprint = approvalFingerprint(base);
  const authorization = {
    ...buildInstagramCanaryAuthorization({
      username: base.username,
      mediaUrl: base.media_url,
      mediaType: base.media_type,
      caption: base.caption,
      expiresAt: base.authorization_expires_at,
      now,
    }),
    package_fingerprint: fingerprint,
    publish_once: true,
  };
  return { ...base, content_fingerprint: fingerprint, authorization, ...overrides };
}

test('exact approved account, asset, caption, type and timing package is accepted', () => {
  assert.equal(validatePublishingPackageIngress(pkg(), { now }).ok, true);
});

test('changing any approved publishing field invalidates authorization', () => {
  for (const changed of [
    { asset_sha256: 'b'.repeat(64) },
    { account: 'other.account' },
    { media_type: 'REELS', content_type: 'REELS' },
    { caption: 'changed' },
    { latest_publish_at: '2026-09-24T20:00:00+02:00' },
  ]) {
    const result = validatePublishingPackageIngress(pkg(changed), { now });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.includes('package_authorization_fingerprint_mismatch') || result.blockers.includes('package_account_username_mismatch'));
  }
});

test('ingress schedules once and exposes no provider write', () => {
  let calls = 0;
  const scheduler = { schedule(received) { calls += 1; assert.equal(Object.isFrozen(received), true); return { status: 'SCHEDULED', publication_id: received.publication_id }; } };
  const result = scheduleApprovedPublishingPackage({ scheduler, publicationPackage: pkg(), now });
  assert.equal(result.status, 'SCHEDULED');
  assert.equal(result.immutable, true);
  assert.equal(result.provider_writes, 0);
  assert.equal(calls, 1);
});

test('missing exact authorization blocks before scheduler', () => {
  let calls = 0;
  const scheduler = { schedule() { calls += 1; } };
  const value = pkg();
  value.authorization = { ...value.authorization, package_fingerprint: '0'.repeat(64) };
  const result = scheduleApprovedPublishingPackage({ scheduler, publicationPackage: value, now });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(calls, 0);
});
