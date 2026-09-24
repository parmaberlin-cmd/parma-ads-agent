'use strict';

const crypto = require('node:crypto');
const { PUBLICATION_STATES, markPublicationState } = require('./instagram-publication-state');

const MANUAL_PUBLICATION_EVENT = 'instagram_manual_publication_reported';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function recordFingerprint(record) {
  return crypto.createHash('sha256').update(JSON.stringify({
    publication_id: record.publication_id,
    account: record.account,
    asset_sha256: record.asset_sha256,
    content_type: record.content_type,
  })).digest('hex');
}

function validateManualPublicationRecord(record = {}) {
  const blockers = [];
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(String(record.publication_id || ''))) blockers.push('manual_publication_id_invalid');
  if (!/^[a-z0-9._]{1,80}$/.test(String(record.account || '').toLowerCase())) blockers.push('manual_publication_account_invalid');
  if (!SHA256_PATTERN.test(String(record.asset_sha256 || '').toLowerCase())) blockers.push('manual_publication_asset_sha256_invalid');
  if (!['STORIES', 'REELS', 'FEED'].includes(String(record.content_type || '').toUpperCase())) blockers.push('manual_publication_content_type_invalid');
  if (record.provider_verified !== false) blockers.push('manual_publication_must_not_claim_provider_verification');
  return { ok: blockers.length === 0, blockers };
}

function manualPublicationRecords(store) {
  return store.list('change').filter(row => row.payload?.kind_event === MANUAL_PUBLICATION_EVENT);
}

function importManualPublicationRecords(store, records = [], { now = Date.now } = {}) {
  if (!store || typeof store.list !== 'function' || typeof store.append !== 'function') throw new Error('durable_publication_store_required');
  const results = [];
  for (const input of records) {
    const check = validateManualPublicationRecord(input);
    if (!check.ok) throw new Error(`invalid_manual_publication_record:${check.blockers.join(',')}`);
    const record = {
      publication_id: input.publication_id,
      account: String(input.account).toLowerCase(),
      asset_sha256: String(input.asset_sha256).toLowerCase(),
      content_type: String(input.content_type).toUpperCase(),
      source_asset: input.source_asset || null,
      provider_verified: false,
      reported_at: input.reported_at || new Date(now()).toISOString(),
    };
    const fingerprint = recordFingerprint(record);
    const exists = manualPublicationRecords(store).some(row => row.payload?.record_fingerprint === fingerprint);
    if (exists) {
      results.push({ publication_id: record.publication_id, status: 'ALREADY_RECORDED', record_fingerprint: fingerprint });
      continue;
    }
    store.append('change', {
      kind_event: MANUAL_PUBLICATION_EVENT,
      ...record,
      record_fingerprint: fingerprint,
      status: 'REPORTED_PUBLISHED',
      writes_executed: 0,
      real_instagram_publication_attempted: false,
      at: new Date(now()).toISOString(),
    });
    markPublicationState(store, {
      publicationId: record.publication_id,
      status: PUBLICATION_STATES.HELD,
      reason: 'manual_publication_reported_duplicate_block',
      evidence: { asset_sha256: record.asset_sha256, provider_verified: false },
      now,
    });
    results.push({ publication_id: record.publication_id, status: 'RECORDED', record_fingerprint: fingerprint });
  }
  return results;
}

function manuallyPublishedAsset(store, publicationPackage = {}) {
  const assetHash = String(publicationPackage.asset_sha256 || '').toLowerCase();
  if (!SHA256_PATTERN.test(assetHash)) return false;
  const account = String(publicationPackage.account || publicationPackage.username || '').toLowerCase();
  const contentType = String(publicationPackage.content_type || publicationPackage.media_type || '').toUpperCase();
  return manualPublicationRecords(store).some(row =>
    row.payload?.asset_sha256 === assetHash &&
    row.payload?.account === account &&
    row.payload?.content_type === contentType
  );
}

module.exports = {
  MANUAL_PUBLICATION_EVENT,
  validateManualPublicationRecord,
  manualPublicationRecords,
  importManualPublicationRecords,
  manuallyPublishedAsset,
};
