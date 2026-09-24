'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { ControlledAdsStore } = require('../ads-controlled-execution-core');
const {
  importManualPublicationRecords,
  manuallyPublishedAsset,
  manualPublicationRecords,
} = require('../instagram-manual-publication-registry');

function store(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'instagram-manual-publication-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new ControlledAdsStore({ directory: root, integrityKey: randomBytes(32), now: () => Date.parse('2026-09-24T16:30:00Z') });
}

const record = {
  publication_id: 'manual-story-1',
  account: 'parma.divinibenedetti',
  asset_sha256: 'a'.repeat(64),
  content_type: 'STORIES',
  provider_verified: false,
  reported_at: '2026-09-24',
};

test('manual publication import is durable and idempotent without claiming provider verification', t => {
  const s = store(t);
  assert.equal(importManualPublicationRecords(s, [record])[0].status, 'RECORDED');
  assert.equal(importManualPublicationRecords(s, [record])[0].status, 'ALREADY_RECORDED');
  assert.equal(manualPublicationRecords(s).length, 1);
  assert.equal(manualPublicationRecords(s)[0].payload.provider_verified, false);
});

test('matching account, content type and asset hash blocks duplicate automatic publication', t => {
  const s = store(t);
  importManualPublicationRecords(s, [record]);
  assert.equal(manuallyPublishedAsset(s, { username: record.account, media_type: 'STORIES', asset_sha256: record.asset_sha256 }), true);
  assert.equal(manuallyPublishedAsset(s, { username: record.account, media_type: 'REELS', asset_sha256: record.asset_sha256 }), false);
  assert.equal(manuallyPublishedAsset(s, { username: record.account, media_type: 'STORIES', asset_sha256: 'b'.repeat(64) }), false);
});

test('manual record fails closed when provider verification is asserted without evidence', t => {
  const s = store(t);
  assert.throws(() => importManualPublicationRecords(s, [{ ...record, provider_verified: true }]), /manual_publication_must_not_claim_provider_verification/);
});
