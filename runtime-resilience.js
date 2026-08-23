class CircuitBreaker {
  constructor({ failureThreshold = 3, cooldownMs = 60000, now = () => Date.now() } = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.failures = 0;
    this.openedAt = null;
  }

  state() {
    if (this.openedAt == null) return 'closed';
    if (this.now() - this.openedAt >= this.cooldownMs) return 'half_open';
    return 'open';
  }

  canAttempt() {
    return this.state() !== 'open';
  }

  recordSuccess() {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = this.now();
  }

  snapshot() {
    return { state: this.state(), failures: this.failures, failure_threshold: this.failureThreshold, cooldown_ms: this.cooldownMs };
  }
}

class WindowRateLimiter {
  constructor({ limit = 30, windowMs = 60000, now = () => Date.now() } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.timestamps = [];
  }

  prune() {
    const floor = this.now() - this.windowMs;
    this.timestamps = this.timestamps.filter((timestamp) => timestamp > floor);
  }

  allow() {
    this.prune();
    if (this.timestamps.length >= this.limit) return false;
    this.timestamps.push(this.now());
    return true;
  }

  snapshot() {
    this.prune();
    return { used: this.timestamps.length, limit: this.limit, window_ms: this.windowMs, remaining: Math.max(0, this.limit - this.timestamps.length) };
  }
}

function classifyApiFailure(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  const code = String(error?.code || '');
  const message = String(error?.message || error?.response?.data?.error?.message || '');
  if ([408, 429, 500, 502, 503, 504].includes(status) || /timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|rate limit/i.test(`${code} ${message}`)) return 'transient';
  if ([400, 401, 403, 404].includes(status)) return 'permanent';
  return 'unknown';
}

function retryPolicy({ operation = 'read', error, attempt = 1, maxReadAttempts = 2 } = {}) {
  if (operation !== 'read') return { retry: false, reason: 'writes_are_never_auto_retried' };
  if (attempt >= maxReadAttempts) return { retry: false, reason: 'read_retry_limit_reached' };
  if (classifyApiFailure(error) !== 'transient') return { retry: false, reason: 'non_transient_failure' };
  return { retry: true, reason: 'transient_read_failure' };
}

async function executeProtectedRead(fn, { breaker = new CircuitBreaker(), limiter = new WindowRateLimiter() } = {}) {
  if (!breaker.canAttempt()) return { ok: false, blocked: true, reason: 'circuit_open', writes_allowed: false };
  if (!limiter.allow()) return { ok: false, blocked: true, reason: 'rate_limited_locally', writes_allowed: false };
  try {
    const value = await fn();
    breaker.recordSuccess();
    return { ok: true, value, breaker: breaker.snapshot(), rate_limit: limiter.snapshot(), writes_allowed: false };
  } catch (error) {
    breaker.recordFailure();
    return { ok: false, error_class: classifyApiFailure(error), breaker: breaker.snapshot(), rate_limit: limiter.snapshot(), writes_allowed: false };
  }
}

module.exports = { CircuitBreaker, WindowRateLimiter, classifyApiFailure, retryPolicy, executeProtectedRead };