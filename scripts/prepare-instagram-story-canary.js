#!/usr/bin/env node
'use strict';

const {
  contentHash,
  buildInstagramCanaryAuthorization,
  validateOnlyInstagramCanary,
} = require('../instagram-organic-canary');
const {
  facebookGraphReadTransport,
  instagramLoginWriteTransport,
} = require('../instagram-organic-read-path');
const {
  InstagramEditorialScheduler,
  packageFingerprint,
  evaluateEditorialTiming,
} = require('../instagram-editorial-timing');
const { createInstagramOrganicAuditStore } = require('../meta-durable-audit');
const { latestPublicationState } = require('../instagram-publication-state');

const DEFAULT_ACCOUNT = 'parma.divinibenedetti';
const DEFAULT_IG_USER_ID = process.env.INSTAGRAM_CANARY_IG_USER_ID || '17841463253292929';
const DEFAULT_MEDIA_URL = process.env.INSTAGRAM_CANARY_MEDIA_URL || null;
const DEFAULT_PUBLICATION_ID = process.env.INSTAGRAM_CANARY_PUBLICATION_ID || 'story-canary-20260911-1';
const DEFAULT_EARLIEST = process.env.INSTAGRAM_CANARY_EARLIEST_AT || '2026-09-11T18:00:00+02:00';
const DEFAULT_PREFERRED = process.env.INSTAGRAM_CANARY_PREFERRED_AT || '2026-09-11T18:15:00+02:00';
const DEFAULT_LATEST = process.env.INSTAGRAM_CANARY_LATEST_AT || '2026-09-11T19:00:00+02:00';
const DEFAULT_EXPIRES = process.env.INSTAGRAM_CANARY_EXPIRES_AT || '2026-09-11T19:30:00+02:00';
const DEFAULT_SOCIAL_COPY = 'pasta fatta a mano. focaccia calda. vino. stasera da parma.';

function sanitize(value) {
  return String(value || '');
}

function buildPackage({ now = Date.now } = {}) {
  const mediaUrl = DEFAULT_MEDIA_URL;
  if (!mediaUrl) throw new Error('INSTAGRAM_CANARY_MEDIA_URL_required');
  const mediaType = 'STORIES';
  const caption = '';
  const hash = contentHash(mediaUrl, caption, mediaType);
  const authorization = buildInstagramCanaryAuthorization({
    username: DEFAULT_ACCOUNT,
    mediaUrl,
    mediaType,
    caption,
    expiresAt: DEFAULT_EXPIRES,
    now,
  });
  const pkg = {
    publication_id: DEFAULT_PUBLICATION_ID,
    account: DEFAULT_ACCOUNT,
    username: DEFAULT_ACCOUNT,
    instagram_user_id: DEFAULT_IG_USER_ID,
    media_type: mediaType,
    media_url: mediaUrl,
    caption,
    social_copy: DEFAULT_SOCIAL_COPY,
    content_fingerprint: hash,
    authorization,
    timezone: 'Europe/Berlin',
    earliest_publish_at: DEFAULT_EARLIEST,
    preferred_publish_at: DEFAULT_PREFERRED,
    latest_publish_at: DEFAULT_LATEST,
    authorization_expires_at: DEFAULT_EXPIRES,
  };
  pkg.package_fingerprint = packageFingerprint(pkg);
  return pkg;
}

async function main() {
  const env = process.env;
  const now = Date.now;
  const store = createInstagramOrganicAuditStore({
    env,
    now,
    requireDurableMount: true,
  });
  const scheduler = new InstagramEditorialScheduler({ store, now });
  const pkg = buildPackage({ now });

  const readTransport = env.META_ACCESS_TOKEN
    ? facebookGraphReadTransport({ accessToken: env.META_ACCESS_TOKEN })
    : null;
  const writeTransport = env.META_ACCESS_TOKEN
    ? instagramLoginWriteTransport({ accessToken: env.META_ACCESS_TOKEN })
    : null;

  const readOnlyValidation = await validateOnlyInstagramCanary({
    env,
    now,
    transport: readTransport,
    loginTransport: writeTransport,
    adAccountId: env.META_AD_ACCOUNT_ID,
    username: pkg.username,
    mediaAsset: {
      media_type: pkg.media_type,
      video_url: pkg.media_url,
      caption: pkg.caption,
    },
    authorization: pkg.authorization,
    auditStore: store,
    instagramUserId: pkg.instagram_user_id,
    preferredReadPath: 'instagram_login',
    requireDurableMount: true,
  });

  const scheduling = scheduler.schedule(pkg);
  const duplicate = scheduler.schedule(pkg);
  const timing = evaluateEditorialTiming({
    package: pkg,
    technical_ready: true,
    editorial_ready: true,
    now,
  });

  console.log(JSON.stringify({
    schema: 'instagram.story_canary_preparation.v1',
    publication_id: pkg.publication_id,
    media: {
      url: pkg.media_url,
      type: pkg.media_type,
    },
    message: pkg.social_copy,
    target_account: {
      username: pkg.username,
      instagram_user_id: pkg.instagram_user_id,
      verified: readOnlyValidation.username === pkg.username && readOnlyValidation.instagram_user_id === pkg.instagram_user_id,
    },
    scheduling,
    duplicate_protection: duplicate,
    timing_status: timing.status,
    provider_writes_allowed: timing.provider_writes_allowed === true,
    read_only_validation: {
      status: readOnlyValidation.status,
      blockers: readOnlyValidation.blockers || [],
    },
    publication_state: latestPublicationState(store, pkg.publication_id),
    writes_executed: 0,
    real_instagram_publication_attempted: false,
    provider_writes: 0,
  }));

  if (readOnlyValidation.status !== 'READY_FOR_INSTAGRAM_CANARY') {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(JSON.stringify({
    status: 'BLOCKED',
    blockers: [String(error?.message || error).slice(0, 240)],
    writes_executed: 0,
    provider_writes: 0,
  }));
  process.exitCode = 1;
});
