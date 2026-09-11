'use strict';

const PUBLICATION_STATE_PHASE = 'instagram_publication_state';

const PUBLICATION_STATES = Object.freeze({
  PLANNED: 'PLANNED',
  SCHEDULED: 'SCHEDULED',
  DISPATCHED: 'DISPATCHED',
  CONTAINER_CREATED: 'CONTAINER_CREATED',
  PUBLISHED: 'PUBLISHED',
  VERIFIED_LIVE: 'VERIFIED_LIVE',
  FAILED: 'FAILED',
  AMBIGUOUS: 'AMBIGUOUS',
  HELD: 'HELD',
});

const TERMINAL_STATES = Object.freeze(new Set([
  PUBLICATION_STATES.VERIFIED_LIVE,
  PUBLICATION_STATES.FAILED,
  PUBLICATION_STATES.HELD,
]));

const RETRYABLE_STATES = Object.freeze(new Set([
  PUBLICATION_STATES.PLANNED,
  PUBLICATION_STATES.SCHEDULED,
  PUBLICATION_STATES.FAILED,
]));

const NON_RETRYABLE_FAILURE_REASONS = Object.freeze(new Set([
  'duplicate_publication_blocked',
  'authorization_already_used',
  'authorization_expired',
  'publication_window_expired',
  'content_fingerprint_required',
  'account_required',
]));

function publicationStateRecords(store) {
  return store.list('state').filter(record =>
    record.payload?.phase === PUBLICATION_STATE_PHASE
  );
}

function latestPublicationState(store, publicationId) {
  const records = publicationStateRecords(store).filter(record =>
    record.payload?.publication_id === publicationId
  );
  return records.at(-1)?.payload || null;
}

function currentPublicationState(store, publicationId) {
  const explicit = latestPublicationState(store, publicationId);
  if (explicit) return explicit;

  const changes = store.list('change').filter(record =>
    record.payload?.publication_id === publicationId
  );
  const verified = changes.find(record => record.payload?.status === 'INSTAGRAM_PUBLISH_VERIFIED');
  if (verified) {
    return {
      phase: PUBLICATION_STATE_PHASE,
      publication_id: publicationId,
      status: PUBLICATION_STATES.VERIFIED_LIVE,
      reason: 'inferred_from_verified_change',
      at: verified.created_at,
    };
  }
  const attempted = changes.find(record => record.payload?.real_instagram_publication_attempted === true);
  if (attempted) {
    return {
      phase: PUBLICATION_STATE_PHASE,
      publication_id: publicationId,
      status: PUBLICATION_STATES.AMBIGUOUS,
      reason: 'inferred_from_attempted_change',
      at: attempted.created_at,
    };
  }
  const blocked = changes.find(record =>
    record.payload?.status === 'BLOCKED' &&
    record.payload?.real_instagram_publication_attempted === false
  );
  if (blocked) {
    return {
      phase: PUBLICATION_STATE_PHASE,
      publication_id: publicationId,
      status: PUBLICATION_STATES.FAILED,
      reason: blocked.payload.blockers?.[0] || 'inferred_from_blocked_change',
      at: blocked.created_at,
    };
  }
  return null;
}

function hasScheduleExecuted(store, scheduleFingerprint) {
  return store.list('change').some(record =>
    record.payload?.kind_event === 'instagram_editorial_schedule_executed' &&
    record.payload?.schedule_fingerprint === scheduleFingerprint
  );
}

function markScheduleExecuted(store, {
  publicationId,
  scheduleFingerprint,
  reason = null,
  now = Date.now,
} = {}) {
  if (hasScheduleExecuted(store, scheduleFingerprint)) return false;
  store.append('change', {
    kind_event: 'instagram_editorial_schedule_executed',
    publication_id: publicationId,
    schedule_fingerprint: scheduleFingerprint,
    executed: true,
    reason,
    at: new Date(now()).toISOString(),
  });
  return true;
}

function markPublicationState(store, {
  publicationId,
  status,
  reason = null,
  evidence = null,
  retryAfter = null,
  now = Date.now,
} = {}) {
  if (!Object.values(PUBLICATION_STATES).includes(status)) {
    throw new Error(`invalid_publication_state:${status}`);
  }
  const current = latestPublicationState(store, publicationId);
  if (current && current.status === status && current.reason === reason) {
    return current;
  }
  const payload = {
    phase: PUBLICATION_STATE_PHASE,
    publication_id: publicationId,
    status,
    reason,
    evidence: evidence || null,
    retry_after: retryAfter || null,
    at: new Date(now()).toISOString(),
  };
  store.append('state', payload);
  return payload;
}

function isTerminalPublicationState(status) {
  return TERMINAL_STATES.has(status);
}

function isRetryablePublicationState(status) {
  return RETRYABLE_STATES.has(status);
}

function derivePublicationState(result = {}) {
  const status = String(result.status || '').toUpperCase();
  if (status === 'INSTAGRAM_PUBLISH_VERIFIED') return PUBLICATION_STATES.VERIFIED_LIVE;
  if (result.real_instagram_publication_attempted === true) return PUBLICATION_STATES.AMBIGUOUS;
  if (status === 'RECONCILIATION_REQUIRED') return PUBLICATION_STATES.AMBIGUOUS;
  if (['CONTAINER_FAILED', 'CONTAINER_EXPIRED', 'POLLING_TIMEOUT', 'BLOCKED'].includes(status)) {
    return PUBLICATION_STATES.FAILED;
  }
  return PUBLICATION_STATES.AMBIGUOUS;
}

function canRetryPublicationState(state, now = Date.now) {
  if (!state) return true;
  if (state.status === PUBLICATION_STATES.PLANNED || state.status === PUBLICATION_STATES.SCHEDULED) {
    return true;
  }
  if (state.status !== PUBLICATION_STATES.FAILED) return false;
  if (NON_RETRYABLE_FAILURE_REASONS.has(state.reason)) return false;
  if (state.retry_after) return now() >= Date.parse(state.retry_after);
  return true;
}

function providerWritesAllowed(env = process.env) {
  return env.INSTAGRAM_PROVIDER_WRITES === '1';
}

function frozenProviderResult(pkg = {}) {
  return {
    status: 'BLOCKED',
    blockers: ['provider_writes_frozen'],
    interface: 'EXECUTE_PUBLICATION',
    publication_id: pkg.publication_id || null,
    writes_executed: 0,
    real_instagram_publication_attempted: false,
    provider_writes: 0,
  };
}

module.exports = {
  PUBLICATION_STATE_PHASE,
  PUBLICATION_STATES,
  TERMINAL_STATES,
  RETRYABLE_STATES,
  NON_RETRYABLE_FAILURE_REASONS,
  publicationStateRecords,
  latestPublicationState,
  currentPublicationState,
  hasScheduleExecuted,
  markScheduleExecuted,
  markPublicationState,
  isTerminalPublicationState,
  isRetryablePublicationState,
  derivePublicationState,
  canRetryPublicationState,
  providerWritesAllowed,
  frozenProviderResult,
};
