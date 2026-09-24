'use strict';

const { validatePublishingPackageIngress } = require('./instagram-package-ingress');
const { evaluateEditorialTiming, EDITORIAL_READINESS_STATUS } = require('./instagram-editorial-timing');
const { providerWritesAllowed, currentPublicationState, PUBLICATION_STATES } = require('./instagram-publication-state');

function scheduledPackage(store, publicationId) {
  if (!store || typeof store.list !== 'function') throw new Error('durable_publication_store_required');
  const rows = store.list('change').filter(row =>
    row.payload?.kind_event === 'instagram_editorial_schedule_created' &&
    row.payload?.publication_id === publicationId &&
    row.payload?.serialized_package
  );
  const encoded = rows.at(-1)?.payload?.serialized_package;
  if (!encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new Error('scheduled_publication_package_invalid');
  }
}

async function executeScheduledInstagramPublish({
  env = process.env,
  store,
  publicationId,
  runtimeKillSwitch = false,
  now = Date.now,
  editorialRuntime,
} = {}) {
  const blocked = reason => ({
    validated: false,
    correctable: false,
    evidence: {
      schema: 'instagram.runtime_publish.v1',
      status: 'BLOCKED',
      publication_id: publicationId || null,
      blockers: [reason],
      writes_executed: 0,
      provider_writes: 0,
    },
  });
  if (runtimeKillSwitch) return blocked('runtime_kill_switch_active');
  if (!providerWritesAllowed(env)) return blocked('provider_writes_frozen');
  if (!editorialRuntime || typeof editorialRuntime.wakePublication !== 'function') return blocked('instagram_publish_executor_unavailable');
  const publicationPackage = scheduledPackage(store, publicationId);
  if (!publicationPackage) return blocked('scheduled_publication_package_not_found');
  const ingress = validatePublishingPackageIngress(publicationPackage, { now });
  if (!ingress.ok) return {
    ...blocked('scheduled_publication_package_invalid'),
    evidence: {
      ...blocked('scheduled_publication_package_invalid').evidence,
      blockers: ingress.blockers,
    },
  };
  const timing = evaluateEditorialTiming({
    package: publicationPackage,
    technical_ready: true,
    editorial_ready: true,
    now,
  });
  if (timing.status !== EDITORIAL_READINESS_STATUS.TIMING_READY) {
    return {
      ...blocked(timing.blockers?.[0] || timing.status),
      evidence: {
        ...blocked(timing.blockers?.[0] || timing.status).evidence,
        timing_status: timing.status,
      },
    };
  }
  const rows = await editorialRuntime.wakePublication(publicationPackage.publication_id);
  const row = Array.isArray(rows)
    ? rows.find(candidate => candidate.publication_id === publicationPackage.publication_id)
    : null;
  const durableState = currentPublicationState(store, publicationPackage.publication_id);
  const result = row?.execution || row?.reconciliation || durableState?.evidence || row || durableState || {};
  const verified = (
    row?.status === PUBLICATION_STATES.VERIFIED_LIVE ||
    durableState?.status === PUBLICATION_STATES.VERIFIED_LIVE ||
    result?.status === 'INSTAGRAM_PUBLISH_VERIFIED'
  ) && result?.verification_result !== false;
  return {
    validated: verified,
    correctable: false,
    evidence: {
      schema: 'instagram.runtime_publish.v1',
      status: verified ? 'INSTAGRAM_PUBLISH_VERIFIED' : (result?.status || row?.status || durableState?.status || 'BLOCKED'),
      publication_id: publicationPackage.publication_id,
      media_type: publicationPackage.media_type,
      instagram_media_id: result?.instagram_media_id || null,
      container_id: result?.container_id || null,
      permalink: result?.permalink || null,
      verification_result: verified,
      reconciliation: Boolean(row?.reconciliation),
      blockers: result?.blockers || [],
      writes_executed: Number(result?.writes_executed || 0),
      provider_writes: Number(result?.provider_writes ?? result?.writes_executed ?? 0),
    },
  };
}

module.exports = {
  scheduledPackage,
  executeScheduledInstagramPublish,
};
