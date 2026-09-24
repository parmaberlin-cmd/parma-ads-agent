'use strict';

const crypto = require('node:crypto');
const { validatePublicationPackage } = require('./instagram-organic-publication');
const { validatePublicationWindow, packageFingerprint } = require('./instagram-editorial-timing');

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function approvalFingerprint(pkg = {}) {
  return crypto.createHash('sha256').update(JSON.stringify({
    account: String(pkg.account || pkg.username || '').toLowerCase(),
    asset_sha256: String(pkg.asset_sha256 || '').toLowerCase(),
    caption: String(pkg.caption || ''),
    content_type: String(pkg.content_type || pkg.media_type || '').toUpperCase(),
    media_url: String(pkg.media_url || ''),
    earliest_publish_at: pkg.earliest_publish_at || null,
    preferred_publish_at: pkg.preferred_publish_at || null,
    latest_publish_at: pkg.latest_publish_at || null,
  })).digest('hex');
}

function validatePublishingPackageIngress(pkg, { now = Date.now } = {}) {
  const blockers = [];
  const publication = validatePublicationPackage(pkg, { now });
  if (!publication.ok) blockers.push(...publication.blockers);
  const timing = validatePublicationWindow(pkg, { now });
  if (!timing.ok) blockers.push(...timing.blockers);
  if (!SHA256_PATTERN.test(String(pkg?.asset_sha256 || '').toLowerCase())) blockers.push('asset_sha256_required');
  if (String(pkg?.account || '').toLowerCase() !== String(pkg?.username || '').toLowerCase()) blockers.push('package_account_username_mismatch');
  const expectedApproval = approvalFingerprint(pkg);
  if (pkg?.authorization?.package_fingerprint !== expectedApproval) blockers.push('package_authorization_fingerprint_mismatch');
  if (pkg?.authorization?.publish_once !== true) blockers.push('package_authorization_publish_once_required');
  if (pkg?.content_fingerprint !== expectedApproval) blockers.push('content_fingerprint_must_match_approved_package');
  return {
    ok: blockers.length === 0,
    blockers: [...new Set(blockers)],
    approval_fingerprint: expectedApproval,
  };
}

function scheduleApprovedPublishingPackage({ scheduler, publicationPackage, now = Date.now } = {}) {
  if (!scheduler || typeof scheduler.schedule !== 'function') throw new Error('instagram_editorial_scheduler_required');
  const validation = validatePublishingPackageIngress(publicationPackage, { now });
  if (!validation.ok) {
    return {
      status: 'BLOCKED',
      blockers: validation.blockers,
      publication_id: publicationPackage?.publication_id || null,
      provider_writes: 0,
    };
  }
  const scheduled = scheduler.schedule(Object.freeze({ ...publicationPackage }));
  return {
    ...scheduled,
    package_fingerprint: packageFingerprint(publicationPackage),
    approval_fingerprint: validation.approval_fingerprint,
    immutable: true,
    provider_writes: 0,
  };
}

module.exports = {
  approvalFingerprint,
  validatePublishingPackageIngress,
  scheduleApprovedPublishingPackage,
};
