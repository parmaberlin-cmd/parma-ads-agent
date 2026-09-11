'use strict';

const {
  facebookGraphReadTransport,
  instagramLoginReadTransport,
} = require('./instagram-organic-read-path');
const {
  getContainerStatus,
  verifyPublishedMedia,
} = require('./instagram-content-publishing');
const {
  PUBLICATION_STATES,
  markPublicationState,
} = require('./instagram-publication-state');

function createProductionReconcileCallback({
  env = process.env,
  store,
  now = Date.now,
} = {}) {
  if (!store || typeof store.append !== 'function' || typeof store.list !== 'function') {
    throw new Error('durable_store_required');
  }
  const facebookTransport = env.META_ACCESS_TOKEN
    ? facebookGraphReadTransport({ accessToken: env.META_ACCESS_TOKEN })
    : null;
  const loginTransport = env.META_ACCESS_TOKEN
    ? instagramLoginReadTransport({ accessToken: env.META_ACCESS_TOKEN })
    : null;

  async function verifyWithTransport(pkg, state) {
    const evidence = state?.evidence || {};
    const mediaId = evidence.instagram_media_id || evidence.media_id || state?.instagram_media_id || null;
    if (mediaId && loginTransport) {
      const verification = await verifyPublishedMedia({ transport: loginTransport, mediaId });
      if (verification.published && verification.media?.permalink) {
        return {
          status: PUBLICATION_STATES.VERIFIED_LIVE,
          provider_writes: 0,
          instagram_media_id: verification.media.id,
          permalink: verification.media.permalink,
          verification,
        };
      }
    }

    const containerId = evidence.container_id || state?.container_id || null;
    if (containerId && loginTransport) {
      const containerStatus = await getContainerStatus({ transport: loginTransport, containerId });
      if (containerStatus.failed) {
        return {
          status: PUBLICATION_STATES.FAILED,
          provider_writes: 0,
          reason: containerStatus.status_code === 'EXPIRED' ? 'container_expired' : 'container_error',
          container_status: containerStatus,
        };
      }
      if (containerStatus.ready) {
        return {
          status: PUBLICATION_STATES.CONTAINER_CREATED,
          provider_writes: 0,
          reason: 'container_finished_but_publish_not_verified',
          container_status: containerStatus,
        };
      }
    }

    return {
      status: PUBLICATION_STATES.AMBIGUOUS,
      provider_writes: 0,
      reason: 'no_provider_verification_evidence',
    };
  }

  return async (pkg, state) => {
    const currentStatus = state?.status || null;
    if (![
      PUBLICATION_STATES.AMBIGUOUS,
      PUBLICATION_STATES.DISPATCHED,
      PUBLICATION_STATES.CONTAINER_CREATED,
      PUBLICATION_STATES.PUBLISHED,
    ].includes(currentStatus)) {
      return { status: 'NO_RECONCILIATION_NEEDED', provider_writes: 0 };
    }

    let result;
    try {
      result = await verifyWithTransport(pkg, state);
    } catch (error) {
      result = {
        status: PUBLICATION_STATES.AMBIGUOUS,
        provider_writes: 0,
        reason: 'readonly_reconciliation_failed',
        error: String(error?.message || error).slice(0, 240),
      };
    }

    markPublicationState(store, {
      publicationId: pkg.publication_id,
      status: result.status,
      reason: result.reason || result.status,
      evidence: result,
      now,
    });
    return result;
  };
}

module.exports = {
  createProductionReconcileCallback,
};
