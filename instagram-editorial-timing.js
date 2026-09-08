'use strict';

const crypto = require('node:crypto');

const EDITORIAL_READINESS_STATUS = Object.freeze({
  TECHNICAL_READY: 'TECHNICAL_READY',
  EDITORIAL_READY: 'EDITORIAL_READY',
  TIMING_READY: 'TIMING_READY',
  WAIT_FOR_PUBLICATION_WINDOW: 'WAIT_FOR_PUBLICATION_WINDOW',
  PUBLICATION_WINDOW_EXPIRED: 'PUBLICATION_WINDOW_EXPIRED',
  BLOCKED: 'BLOCKED',
});

const DEFAULT_TIMEZONE = 'Europe/Berlin';

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function berlinParts(iso, now = Date.now) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new TypeError('invalid_timestamp');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    timeZoneName: 'longOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
    offset: values.timeZoneName || null,
    iso: date.toISOString(),
  };
}

function isDstInBerlin(iso) {
  const parts = berlinParts(iso);
  return parts.offset === 'GMT+02:00';
}

function validatePublicationWindow(pkg, { now = Date.now } = {}) {
  const blockers = [];
  if (!pkg || typeof pkg !== 'object') return { ok: false, blockers: ['package_required'] };
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(String(pkg.publication_id || ''))) blockers.push('publication_id_invalid');
  if (!pkg.earliest_publish_at || Number.isNaN(Date.parse(pkg.earliest_publish_at))) blockers.push('earliest_publish_at_invalid');
  if (!pkg.latest_publish_at || Number.isNaN(Date.parse(pkg.latest_publish_at))) blockers.push('latest_publish_at_invalid');
  if (pkg.preferred_publish_at !== undefined && Number.isNaN(Date.parse(pkg.preferred_publish_at))) blockers.push('preferred_publish_at_invalid');
  if (pkg.earliest_publish_at && pkg.latest_publish_at && Date.parse(pkg.earliest_publish_at) >= Date.parse(pkg.latest_publish_at)) blockers.push('publication_window_invalid');
  if (pkg.timezone && pkg.timezone !== DEFAULT_TIMEZONE) blockers.push('publication_timezone_not_supported');
  if (pkg.authorization_expires_at && now() >= Date.parse(pkg.authorization_expires_at)) blockers.push('authorization_expired');
  if (!pkg.content_fingerprint) blockers.push('content_fingerprint_required');
  if (!pkg.account) blockers.push('account_required');
  return { ok: blockers.length === 0, blockers };
}

function packageFingerprint(pkg) {
  return stableHash({
    publication_id: pkg.publication_id,
    account: pkg.account,
    content_fingerprint: pkg.content_fingerprint,
    package_fingerprint: pkg.package_fingerprint || null,
    timezone: pkg.timezone || DEFAULT_TIMEZONE,
    earliest_publish_at: pkg.earliest_publish_at,
    preferred_publish_at: pkg.preferred_publish_at || null,
    latest_publish_at: pkg.latest_publish_at,
    authorization_expires_at: pkg.authorization_expires_at || null,
  });
}

function evaluateEditorialTiming({
  package: pkg,
  technical_ready = false,
  editorial_ready = false,
  now = Date.now,
} = {}) {
  const validation = validatePublicationWindow(pkg, { now });
  if (!validation.ok) {
    return {
      status: EDITORIAL_READINESS_STATUS.BLOCKED,
      blockers: validation.blockers,
      technical_ready,
      editorial_ready,
      timing_ready: false,
      provider_writes_allowed: false,
      timezone: DEFAULT_TIMEZONE,
    };
  }
  if (!technical_ready || !editorial_ready) {
    return {
      status: EDITORIAL_READINESS_STATUS.BLOCKED,
      blockers: [
        ...(!technical_ready ? ['technical_not_ready'] : []),
        ...(!editorial_ready ? ['editorial_not_ready'] : []),
      ],
      technical_ready,
      editorial_ready,
      timing_ready: false,
      provider_writes_allowed: false,
      timezone: pkg.timezone || DEFAULT_TIMEZONE,
    };
  }
  const nowMs = now();
  const earliest = Date.parse(pkg.earliest_publish_at);
  const latest = Date.parse(pkg.latest_publish_at);
  if (nowMs < earliest) {
    return {
      status: EDITORIAL_READINESS_STATUS.WAIT_FOR_PUBLICATION_WINDOW,
      blockers: [],
      technical_ready,
      editorial_ready,
      timing_ready: false,
      provider_writes_allowed: false,
      timezone: pkg.timezone || DEFAULT_TIMEZONE,
      earliest_publish_at: pkg.earliest_publish_at,
      latest_publish_at: pkg.latest_publish_at,
      seconds_until_window: Math.floor((earliest - nowMs) / 1000),
    };
  }
  if (nowMs > latest) {
    return {
      status: EDITORIAL_READINESS_STATUS.PUBLICATION_WINDOW_EXPIRED,
      blockers: ['publication_window_expired'],
      technical_ready,
      editorial_ready,
      timing_ready: false,
      provider_writes_allowed: false,
      timezone: pkg.timezone || DEFAULT_TIMEZONE,
      earliest_publish_at: pkg.earliest_publish_at,
      latest_publish_at: pkg.latest_publish_at,
    };
  }
  return {
    status: EDITORIAL_READINESS_STATUS.TIMING_READY,
    blockers: [],
    technical_ready,
    editorial_ready,
    timing_ready: true,
    provider_writes_allowed: true,
    timezone: pkg.timezone || DEFAULT_TIMEZONE,
    earliest_publish_at: pkg.earliest_publish_at,
    latest_publish_at: pkg.latest_publish_at,
  };
}

class InstagramEditorialScheduler {
  constructor({ store, now = Date.now } = {}) {
    if (!store || typeof store.append !== 'function' || typeof store.list !== 'function') {
      throw new Error('durable_store_required');
    }
    this.store = store;
    this.now = now;
    this.locks = new Set();
  }

  schedule(pkg) {
    const validation = validatePublicationWindow(pkg, { now: this.now });
    if (!validation.ok) throw new Error(`invalid_schedule:${validation.blockers.join(',')}`);
    const fingerprint = packageFingerprint(pkg);
    const existing = this.store.list('change').some(record => record.payload?.schedule_fingerprint === fingerprint);
    if (existing) return { status: 'DUPLICATE_SCHEDULE_BLOCKED', publication_id: pkg.publication_id, fingerprint };
    this.store.append('change', {
      kind_event: 'instagram_editorial_schedule_created',
      publication_id: pkg.publication_id,
      account: pkg.account,
      content_fingerprint: pkg.content_fingerprint,
      package_fingerprint: pkg.package_fingerprint || null,
      serialized_package: Buffer.from(JSON.stringify(pkg)).toString('base64'),
      schedule_fingerprint: fingerprint,
      earliest_publish_at: pkg.earliest_publish_at,
      preferred_publish_at: pkg.preferred_publish_at || null,
      latest_publish_at: pkg.latest_publish_at,
      timezone: pkg.timezone || DEFAULT_TIMEZONE,
      window_expires_at: pkg.authorization_expires_at || null,
      at: new Date(this.now()).toISOString(),
    });
    return { status: 'SCHEDULED', publication_id: pkg.publication_id, fingerprint };
  }

  hasExecutionIntent(pkg) {
    const fingerprint = packageFingerprint(pkg);
    return this.store.list('change').some(record => record.payload?.schedule_fingerprint === fingerprint && record.payload?.execution_intent === true);
  }

  acquireExecutionLock(publicationId) {
    if (this.locks.has(publicationId)) return false;
    this.locks.add(publicationId);
    return true;
  }

  releaseExecutionLock(publicationId) {
    this.locks.delete(publicationId);
  }

  recordExecutionIntent(pkg, status) {
    this.store.append('change', {
      kind_event: 'instagram_editorial_execution_intent',
      publication_id: pkg.publication_id,
      schedule_fingerprint: packageFingerprint(pkg),
      execution_intent: true,
      status,
      at: new Date(this.now()).toISOString(),
    });
  }

  async tick({ technical_ready, editorial_ready, execute }) {
    const due = this.store.list('change').filter(record =>
      record.payload?.kind_event === 'instagram_editorial_schedule_created' &&
      !record.payload?.executed
    );
    const results = [];
    for (const record of due) {
      const pkg = record.payload.serialized_package
        ? JSON.parse(Buffer.from(record.payload.serialized_package, 'base64').toString('utf8'))
        : {
            publication_id: record.payload.publication_id,
            account: record.payload.account,
            content_fingerprint: record.payload.content_fingerprint,
            package_fingerprint: record.payload.package_fingerprint,
            timezone: record.payload.timezone,
            earliest_publish_at: record.payload.earliest_publish_at,
            preferred_publish_at: record.payload.preferred_publish_at,
            latest_publish_at: record.payload.latest_publish_at,
            authorization_expires_at: record.payload.window_expires_at,
          };
      const timing = evaluateEditorialTiming({
        package: pkg,
        technical_ready,
        editorial_ready,
        now: this.now,
      });
      if (timing.status !== EDITORIAL_READINESS_STATUS.TIMING_READY) {
        results.push({ publication_id: pkg.publication_id, status: timing.status, provider_writes: 0 });
        continue;
      }
      if (this.hasExecutionIntent(pkg) || !this.acquireExecutionLock(pkg.publication_id)) {
        results.push({ publication_id: pkg.publication_id, status: 'DUPLICATE_EXECUTION_BLOCKED', provider_writes: 0 });
        continue;
      }
      try {
        this.recordExecutionIntent(pkg, 'EXECUTING');
        const execution = await execute(pkg);
        results.push({ publication_id: pkg.publication_id, status: execution.status, provider_writes: execution.provider_writes || 0, execution });
      } finally {
        this.releaseExecutionLock(pkg.publication_id);
      }
    }
    return results;
  }

  start({ technical_ready = false, editorial_ready = false, execute, intervalMs = 60000 } = {}) {
    if (typeof execute !== 'function') throw new Error('execute_callback_required');
    if (this.timer) return this;
    const run = async () => {
      try {
        await this.tick({ technical_ready, editorial_ready, execute });
      } catch {
        // No blind retry inside the same tick. Next interval may evaluate again
        // only if no durable execution intent exists.
      }
    };
    this.timer = setInterval(run, intervalMs);
    this.timer.unref?.();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    return this;
  }
}

module.exports = {
  EDITORIAL_READINESS_STATUS,
  DEFAULT_TIMEZONE,
  stableHash,
  berlinParts,
  isDstInBerlin,
  validatePublicationWindow,
  packageFingerprint,
  evaluateEditorialTiming,
  InstagramEditorialScheduler,
};
