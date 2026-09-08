'use strict';

const crypto = require('node:crypto');
const {
  buildContainerPayload,
  createMediaContainer,
  getContainerStatus,
  publishMedia,
  verifyPublishedMedia,
  readMediaInsights,
} = require('./instagram-content-publishing');
const { resolveInstagramOrganicCapability } = require('./instagram-organic-read-path');
const { createInstagramOrganicAuditStore } = require('./meta-durable-audit');
const { META_DOMAINS, createDomainAuthorization, canAuthorizeDomain } = require('./meta-execution-domains');

const INSTAGRAM_CANARY_STATUSES = Object.freeze({
  READY: 'READY_FOR_INSTAGRAM_CANARY',
  VERIFIED: 'INSTAGRAM_PUBLISH_VERIFIED',
  NEEDS_MEDIA_ASSET: 'NEEDS_MEDIA_ASSET',
  CONTAINER_FAILED: 'CONTAINER_FAILED',
  CONTAINER_EXPIRED: 'CONTAINER_EXPIRED',
  POLLING_TIMEOUT: 'POLLING_TIMEOUT',
  BLOCKED: 'BLOCKED',
});

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clockIso(now) {
  return new Date(now()).toISOString();
}

function httpsUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new TypeError('media_url_must_be_https');
  }
  if (url.protocol !== 'https:') throw new TypeError('media_url_must_be_https');
  return url.toString();
}

function validateMediaType(value) {
  const type = String(value || '').toUpperCase();
  if (!['REELS', 'STORIES'].includes(type)) throw new TypeError('media_type_must_be_REELS_or_STORIES');
  return type;
}

function contentHash(mediaUrl, caption, mediaType) {
  return sha256({ media_url: mediaUrl, caption: caption || '', media_type: mediaType });
}

function executionContextFingerprint({ username, mediaUrl, mediaType, caption, hash, resolvedReadPath }) {
  return sha256({
    username,
    media_url: mediaUrl,
    media_type: mediaType,
    caption: caption || '',
    content_hash: hash,
    resolved_read_path: resolvedReadPath,
  });
}

function contentPolicyPreflight({ mediaType, caption, videoUrl }) {
  const blockers = [];
  const type = validateMediaType(mediaType);
  httpsUrl(videoUrl);
  if (type === 'REELS' && String(caption || '').length > 2200) blockers.push('reel_caption_too_long');
  if (type === 'STORIES' && caption) blockers.push('stories_caption_not_supported');
  return { ok: blockers.length === 0, blockers };
}

function canaryEnvState(env = process.env) {
  const enabled = env.INSTAGRAM_ORGANIC_CANARY_ENABLED === 'true';
  const killSwitch = env.INSTAGRAM_ORGANIC_KILL_SWITCH !== 'false';
  return {
    enabled,
    killSwitch,
    publishAutonomyEnabled: env.INSTAGRAM_PUBLISH_AUTONOMY === 'true',
    mediaUrl: env.INSTAGRAM_CANARY_MEDIA_URL || null,
    username: env.INSTAGRAM_CANARY_USERNAME || 'parma.divinibenedetti',
  };
}

function buildBlockedResult(blockers, extra = {}) {
  return {
    status: 'BLOCKED',
    blockers: [...new Set(blockers)],
    writes_executed: 0,
    real_instagram_publication_attempted: false,
    ...extra,
  };
}

function buildInstagramCanaryAuthorization({
  username,
  mediaUrl,
  mediaType,
  caption,
  expiresAt,
  now = Date.now,
} = {}) {
  const hash = contentHash(httpsUrl(mediaUrl), caption || '', validateMediaType(mediaType));
  return {
    ...createDomainAuthorization({
      domain: META_DOMAINS.ORGANIC_PUBLISHING,
      scope: 'instagram_organic_canary_single_publication',
      authorizationId: `instagram-canary-${hash.slice(0, 24)}`,
      expiresAt,
      now,
      maxCostEur: 0,
    }),
    username: String(username || '').toLowerCase(),
    media_url: httpsUrl(mediaUrl),
    media_type: validateMediaType(mediaType),
    caption: caption || null,
    content_hash: hash,
    publish_once: true,
  };
}

async function resolveInstagramOrganicExecutionContext({
  env = process.env,
  now = Date.now,
  transport,
  adAccountId,
  username,
  mediaAsset = null,
  authorization = null,
  auditStore = null,
  readPublishedHashes = null,
  existingMediaIds = null,
  loginTransport = null,
  preferredReadPath = null,
  requireDurableMount = true,
  instagramUserId = null,
} = {}) {
  const state = canaryEnvState(env);
  const resolvedUsername = String(username || state.username || 'parma.divinibenedetti').toLowerCase();
  const blockers = [];
  if (!state.enabled) blockers.push('instagram_organic_canary_disabled_by_default');
  if (state.killSwitch) blockers.push('instagram_organic_kill_switch_active_or_unconfigured');
  if (state.publishAutonomyEnabled) blockers.push('publish_autonomy_must_remain_disabled_for_canary');

  const mediaUrl = mediaAsset?.video_url || mediaAsset?.videoUrl || state.mediaUrl;
  if (!mediaUrl) return { status: INSTAGRAM_CANARY_STATUSES.NEEDS_MEDIA_ASSET, blockers: [...new Set(blockers)], writes_executed: 0, real_instagram_publication_attempted: false };

  let mediaType;
  let caption;
  let policy;
  try {
    mediaType = validateMediaType(mediaAsset?.media_type || mediaAsset?.mediaType || 'REELS');
    caption = mediaAsset?.caption || '';
    policy = contentPolicyPreflight({ mediaType, caption, videoUrl: mediaUrl });
    httpsUrl(mediaUrl);
  } catch (error) {
    return buildBlockedResult([...blockers, error.message], { real_instagram_publication_attempted: false });
  }
  if (!policy.ok) blockers.push(...policy.blockers);

  let store = auditStore;
  if (!store) {
    try {
      store = createInstagramOrganicAuditStore({ env, now, requireDurableMount });
    } catch {
      blockers.push('audit_storage_unavailable');
    }
  }

  let auth = authorization;
  if (!auth) {
    try {
      auth = buildInstagramCanaryAuthorization({
        username: resolvedUsername,
        mediaUrl,
        mediaType,
        caption,
        expiresAt: env.INSTAGRAM_ORGANIC_CANARY_EXPIRES_AT,
        now,
      });
    } catch {
      blockers.push('authorization_unavailable');
    }
  }
  if (auth) {
    const domainCheck = canAuthorizeDomain(auth, META_DOMAINS.ORGANIC_PUBLISHING, { now });
    if (!domainCheck.allowed) blockers.push(domainCheck.reason);
    if (auth.username !== resolvedUsername) blockers.push('instagram_username_mismatch');
    if (auth.content_hash !== contentHash(httpsUrl(mediaUrl), caption || '', mediaType)) blockers.push('media_asset_hash_mismatch');
  }

  const hash = contentHash(httpsUrl(mediaUrl), caption || '', mediaType);
  if (readPublishedHashes && typeof readPublishedHashes === 'function') {
    const known = await readPublishedHashes();
    if (Array.isArray(known) && known.includes(hash)) blockers.push('duplicate_content_detected');
  }
  if (existingMediaIds && typeof existingMediaIds === 'function') {
    const ids = await existingMediaIds();
    if (Array.isArray(ids) && ids.length) blockers.push('instagram_account_has_existing_media_ids');
  }

  if (blockers.length) return buildBlockedResult(blockers, { real_instagram_publication_attempted: false });

  if (!transport || typeof transport.get !== 'function') {
    return buildBlockedResult(['instagram_transport_required'], { real_instagram_publication_attempted: false });
  }
  const capability = await resolveInstagramOrganicCapability({
    facebookTransport: transport,
    loginTransport,
    adAccountId,
    username: resolvedUsername,
    preferredReadPath,
  });
  const canonicalInstagramUserId = capability.account?.user_id || capability.account?.id || capability.instagram_user_id || null;
  if (instagramUserId) {
    if (!canonicalInstagramUserId || String(instagramUserId) !== String(canonicalInstagramUserId)) {
      blockers.push('instagram_user_id_mismatch');
    }
  }
  if (!canonicalInstagramUserId) blockers.push('instagram_user_id_required');
  if (!capability.capabilities.publish) blockers.push('publishing_permission_not_verified');
  const usernameVerified = capability.resolved_read_path === 'instagram_login'
    ? capability.checks.account_read === true && capability.checks.username_match === true
    : capability.checks.instagram_account_discovered === true && capability.username === resolvedUsername;
  if (!usernameVerified) blockers.push('instagram_username_not_verified');
  if (capability.blockers.length) blockers.push(...capability.blockers);
  if (blockers.length) return buildBlockedResult(blockers, { capability, real_instagram_publication_attempted: false });

  if (!store) return buildBlockedResult(['audit_storage_unavailable'], { real_instagram_publication_attempted: false });
  store.append('audit', {
    phase: 'instagram_canary_preflight',
    username: resolvedUsername,
    media_type: mediaType,
    content_hash: hash,
    at: clockIso(now),
  });

  const result = {
    status: INSTAGRAM_CANARY_STATUSES.READY,
    username: resolvedUsername,
    media_type: mediaType,
    caption,
    media_url: httpsUrl(mediaUrl),
    content_hash: hash,
    authorization_id: auth?.authorization_id || null,
    capability,
    instagram_user_id: canonicalInstagramUserId,
    audit_available: true,
    audit_path: store.directory,
    integrity_key_available: true,
    context_fingerprint: executionContextFingerprint({
      username: resolvedUsername,
      mediaUrl: httpsUrl(mediaUrl),
      mediaType,
      caption,
      hash,
      resolvedReadPath: capability.resolved_read_path,
    }),
    writes_executed: 0,
    real_instagram_publication_attempted: false,
  };
  Object.defineProperty(result, '_audit_store', { value: store, enumerable: false });
  return result;
}

async function validateOnlyInstagramCanary(options = {}) {
  return resolveInstagramOrganicExecutionContext(options);
}

async function pollContainerUntilFinished({
  transport,
  containerId,
  now = Date.now,
  timeoutMs = 5 * 60 * 1000,
  intervalMs = 5000,
} = {}) {
  const started = now();
  while (now() - started < timeoutMs) {
    const status = await getContainerStatus({ transport, containerId });
    if (status.failed) {
      const error = new Error(status.status_code === 'EXPIRED' ? 'container_expired' : 'container_error');
      error.code = status.status_code === 'EXPIRED' ? INSTAGRAM_CANARY_STATUSES.CONTAINER_EXPIRED : INSTAGRAM_CANARY_STATUSES.CONTAINER_FAILED;
      throw error;
    }
    if (status.ready) return status;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  const error = new Error('container_polling_timeout');
  error.code = INSTAGRAM_CANARY_STATUSES.POLLING_TIMEOUT;
  throw error;
}

async function executeInstagramCanary({
  env = process.env,
  now = Date.now,
  transport,
  adAccountId,
  username,
  mediaAsset,
  authorization,
  auditStore,
  readPublishedHashes,
  loginTransport,
  preferredReadPath,
  requireDurableMount = true,
  instagramUserId,
  polling = {},
} = {}) {
  const prepared = await resolveInstagramOrganicExecutionContext({
    env,
    now,
    transport,
    adAccountId,
    username,
    mediaAsset,
    authorization,
    auditStore,
    readPublishedHashes,
    loginTransport,
    preferredReadPath,
    requireDurableMount,
    instagramUserId,
  });
  if (prepared.status !== INSTAGRAM_CANARY_STATUSES.READY) return prepared;
  const resolvedAuditStore = auditStore || prepared._audit_store;
  if (!resolvedAuditStore) return buildBlockedResult(['audit_storage_unavailable'], { real_instagram_publication_attempted: false });

  const mediaType = prepared.media_type;
  const caption = prepared.caption;
  const mediaUrl = prepared.media_url;
  const hash = prepared.content_hash;
  const userId = instagramUserId || prepared.instagram_user_id;
  if (!userId) return buildBlockedResult(['instagram_user_id_required'], { real_instagram_publication_attempted: false });
  const executionTransport = prepared.capability?.resolved_read_path === 'instagram_login' ? loginTransport : transport;
  if (!executionTransport || typeof executionTransport.get !== 'function' || typeof executionTransport.post !== 'function') {
    return buildBlockedResult(['instagram_execution_transport_required'], { real_instagram_publication_attempted: false });
  }

  resolvedAuditStore.append('audit', {
    phase: 'instagram_canary_authorized',
    authorization_id: prepared.authorization_id,
    at: clockIso(now),
  });

  let container;
  try {
    const payload = buildContainerPayload({ mediaType, videoUrl: mediaUrl, caption, shareToFeed: true });
    const response = await createMediaContainer({ transport: executionTransport, instagramUserId: userId, mediaType, videoUrl: mediaUrl, caption, shareToFeed: true });
    container = response?.id || response?.container_id;
    if (!container) throw new Error('media_container_id_missing');
    await pollContainerUntilFinished({ transport: executionTransport, containerId: container, now, ...polling });
  } catch (error) {
    resolvedAuditStore.append('audit', {
      phase: 'instagram_container_failed',
      error: error.message,
      at: clockIso(now),
    });
    return {
      status: error.code === INSTAGRAM_CANARY_STATUSES.CONTAINER_EXPIRED
        ? INSTAGRAM_CANARY_STATUSES.CONTAINER_EXPIRED
        : error.code === INSTAGRAM_CANARY_STATUSES.POLLING_TIMEOUT
          ? INSTAGRAM_CANARY_STATUSES.POLLING_TIMEOUT
          : error.code === INSTAGRAM_CANARY_STATUSES.CONTAINER_FAILED
            ? INSTAGRAM_CANARY_STATUSES.CONTAINER_FAILED
            : 'CONTAINER_FAILED',
      error: error.message,
      writes_executed: 0,
      real_instagram_publication_attempted: false,
    };
  }

  const containerId = String(container);
  const publishResponse = await publishMedia({ transport: executionTransport, instagramUserId: userId, containerId });
  const mediaId = publishResponse?.id || publishResponse?.media_id;
  if (!mediaId) {
    resolvedAuditStore.append('audit', { phase: 'instagram_publish_id_missing', at: clockIso(now) });
    return buildBlockedResult(['instagram_publish_id_missing'], { real_instagram_publication_attempted: true });
  }

  const verification = await verifyPublishedMedia({ transport: executionTransport, mediaId });
  if (!verification.published || !verification.media?.permalink) {
    resolvedAuditStore.append('audit', { phase: 'instagram_verification_failed', verification, at: clockIso(now) });
    return buildBlockedResult(['instagram_publication_not_verified'], { verification, real_instagram_publication_attempted: true });
  }

  let insights = null;
  try {
    insights = await readMediaInsights({ transport: executionTransport, mediaId });
  } catch {
    insights = null;
  }

  resolvedAuditStore.append('state', {
    phase: 'instagram_canary_verified',
    username: prepared.username,
    media_type: mediaType,
    media_source: mediaUrl,
    caption,
    content_hash: hash,
    instagram_media_id: mediaId,
    container_id: containerId,
    publish_timestamp: clockIso(now),
    permalink: verification.media.permalink,
    verification_result: verification.published,
    insights_available: Boolean(insights),
  });

  return {
    status: INSTAGRAM_CANARY_STATUSES.VERIFIED,
    username: prepared.username,
    media_type: mediaType,
    media_source: mediaUrl,
    caption,
    content_hash: hash,
    instagram_media_id: mediaId,
    container_id: containerId,
    publish_timestamp: clockIso(now),
    permalink: verification.media.permalink,
      verification_result: verification.published,
      insights_available: Boolean(insights),
      capability: prepared.capability,
      context_fingerprint: prepared.context_fingerprint,
      writes_executed: 1,
    real_instagram_publication_attempted: true,
  };
}

module.exports = {
  INSTAGRAM_CANARY_STATUSES,
  contentHash,
  contentPolicyPreflight,
  buildInstagramCanaryAuthorization,
  resolveInstagramOrganicExecutionContext,
  validateOnlyInstagramCanary,
  pollContainerUntilFinished,
  executeInstagramCanary,
};
