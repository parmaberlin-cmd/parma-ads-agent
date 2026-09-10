'use strict';

const {
  contentHash,
  validateOnlyInstagramCanary,
  executeInstagramCanary,
} = require('./instagram-organic-canary');
const { validateStableVideoUrl } = require('./instagram-media-host');
const { META_DOMAINS, canAuthorizeDomain } = require('./meta-execution-domains');

const PUBLICATION_INTERFACES = Object.freeze({
  VALIDATE: 'VALIDATE_PUBLICATION',
  EXECUTE: 'EXECUTE_PUBLICATION',
});

// Scheduling and execution-intent records are written by the editorial
// scheduler before the publication path runs. They must never be mistaken for
// a completed or in-flight publication attempt, otherwise the first real
// publication after a durable schedule/intent is blocked as a duplicate.
const NON_PUBLICATION_CHANGE_EVENTS = Object.freeze(new Set([
  'instagram_editorial_schedule_created',
  'instagram_editorial_execution_intent',
]));

function validatePublicationPackage(pkg, { now = Date.now } = {}) {
  const blockers = [];
  if (!pkg || typeof pkg !== 'object') return { ok: false, blockers: ['publication_package_required'] };
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(String(pkg.publication_id || ''))) blockers.push('publication_id_invalid');
  if (!/^[a-z0-9._]{1,80}$/.test(String(pkg.username || '').toLowerCase())) blockers.push('publication_username_invalid');
  if (!/^\d{1,30}$/.test(String(pkg.instagram_user_id || ''))) blockers.push('publication_instagram_user_id_invalid');
  if (!['REELS', 'STORIES'].includes(String(pkg.media_type || '').toUpperCase())) blockers.push('publication_media_type_invalid');
  if (typeof pkg.caption !== 'string') blockers.push('publication_caption_invalid');
  if (!pkg.authorization || typeof pkg.authorization !== 'object') blockers.push('publication_authorization_required');
  if (!pkg.media_url) blockers.push('publication_media_url_required');
  else {
    const urlCheck = validateStableVideoUrl(pkg.media_url);
    if (!urlCheck.ok) blockers.push(...urlCheck.blockers);
  }
  if (pkg.authorization) {
    const domainCheck = canAuthorizeDomain(pkg.authorization, META_DOMAINS.ORGANIC_PUBLISHING, { now });
    if (!domainCheck.allowed) blockers.push(domainCheck.reason);
    if (pkg.username && pkg.authorization.username !== String(pkg.username).toLowerCase()) blockers.push('publication_authorization_username_mismatch');
    if (pkg.media_url && pkg.media_type) {
      const expectedHash = contentHash(pkg.media_url, pkg.caption || '', String(pkg.media_type).toUpperCase());
      if (pkg.authorization.content_hash && pkg.authorization.content_hash !== expectedHash) blockers.push('publication_authorization_hash_mismatch');
    }
  }
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

function publicationRecordExists(store, publicationId) {
  return store.list('change').some(record =>
    record.payload?.publication_id === publicationId &&
    !NON_PUBLICATION_CHANGE_EVENTS.has(record.payload?.kind_event)
  );
}

function successfulAuthorizationAlreadyUsed(store, authorizationId) {
  return store.list('change').some(record =>
    record.payload?.authorization_id === authorizationId &&
    record.payload?.status === 'INSTAGRAM_PUBLISH_VERIFIED'
  );
}

function publicationOptions({ publicationPackage, env, store, transport, loginTransport, now, requireDurableMount }) {
  return {
    env,
    now,
    transport,
    loginTransport,
    adAccountId: env.META_AD_ACCOUNT_ID,
    username: publicationPackage.username,
    mediaAsset: {
      media_type: publicationPackage.media_type,
      video_url: publicationPackage.media_url,
      caption: publicationPackage.caption,
    },
    authorization: publicationPackage.authorization,
    auditStore: store,
    instagramUserId: publicationPackage.instagram_user_id,
    preferredReadPath: 'instagram_login',
    requireDurableMount,
  };
}

async function validateInstagramPublication({
  publicationPackage,
  env = process.env,
  store,
  transport,
  loginTransport,
  now = Date.now,
  requireDurableMount = true,
} = {}) {
  const packageCheck = validatePublicationPackage(publicationPackage, { now });
  if (!packageCheck.ok) {
    return {
      status: 'BLOCKED',
      blockers: packageCheck.blockers,
      interface: PUBLICATION_INTERFACES.VALIDATE,
      publication_id: publicationPackage?.publication_id || null,
      writes_executed: 0,
      real_instagram_publication_attempted: false,
    };
  }
  if (!store || typeof store.list !== 'function' || typeof store.append !== 'function') {
    return {
      status: 'BLOCKED',
      blockers: ['durable_publication_store_required'],
      interface: PUBLICATION_INTERFACES.VALIDATE,
      publication_id: publicationPackage.publication_id,
      writes_executed: 0,
      real_instagram_publication_attempted: false,
    };
  }
  if (publicationRecordExists(store, publicationPackage.publication_id)) {
    return {
      status: 'BLOCKED',
      blockers: ['duplicate_publication_blocked'],
      interface: PUBLICATION_INTERFACES.VALIDATE,
      publication_id: publicationPackage.publication_id,
      writes_executed: 0,
      real_instagram_publication_attempted: false,
    };
  }
  if (successfulAuthorizationAlreadyUsed(store, publicationPackage.authorization.authorization_id)) {
    return {
      status: 'BLOCKED',
      blockers: ['authorization_already_used'],
      interface: PUBLICATION_INTERFACES.VALIDATE,
      publication_id: publicationPackage.publication_id,
      writes_executed: 0,
      real_instagram_publication_attempted: false,
    };
  }

  const result = await validateOnlyInstagramCanary(publicationOptions({
    publicationPackage,
    env,
    store,
    transport,
    loginTransport,
    now,
    requireDurableMount,
  }));
  return {
    ...result,
    interface: PUBLICATION_INTERFACES.VALIDATE,
    publication_id: publicationPackage.publication_id,
    status: result.status === 'READY_FOR_INSTAGRAM_CANARY' ? 'READY_FOR_PUBLICATION' : result.status,
  };
}

async function executeInstagramPublication({
  publicationPackage,
  env = process.env,
  store,
  transport,
  loginTransport,
  now = Date.now,
  requireDurableMount = true,
  polling = {},
} = {}) {
  const validation = await validateInstagramPublication({
    publicationPackage,
    env,
    store,
    transport,
    loginTransport,
    now,
    requireDurableMount,
  });
  if (validation.status !== 'READY_FOR_PUBLICATION') return validation;

  const result = await executeInstagramCanary({
    ...publicationOptions({
      publicationPackage,
      env,
      store,
      transport,
      loginTransport,
      now,
      requireDurableMount,
    }),
    polling,
  });

  store.append('change', {
    publication_id: publicationPackage.publication_id,
    authorization_id: publicationPackage.authorization.authorization_id,
    status: result.status,
    interface: PUBLICATION_INTERFACES.EXECUTE,
    instagram_media_id: result.instagram_media_id || null,
    container_id: result.container_id || null,
    permalink: result.permalink || null,
    verification_result: result.verification_result === true,
    writes_executed: result.writes_executed || 0,
    real_instagram_publication_attempted: result.real_instagram_publication_attempted === true,
    at: new Date(now()).toISOString(),
  });

  return {
    ...result,
    interface: PUBLICATION_INTERFACES.EXECUTE,
    publication_id: publicationPackage.publication_id,
  };
}

module.exports = {
  PUBLICATION_INTERFACES,
  validatePublicationPackage,
  publicationRecordExists,
  successfulAuthorizationAlreadyUsed,
  validateInstagramPublication,
  executeInstagramPublication,
};
