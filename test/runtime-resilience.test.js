const test = require('node:test');
const assert = require('node:assert/strict');
const { CircuitBreaker, WindowRateLimiter, classifyApiFailure, retryPolicy, executeProtectedRead } = require('../runtime-resilience');

test('circuit breaker opens after threshold and half-opens after cooldown', () => {
  let now = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: () => now });
  breaker.recordFailure();
  assert.equal(breaker.state(), 'closed');
  breaker.recordFailure();
  assert.equal(breaker.state(), 'open');
  assert.equal(breaker.canAttempt(), false);
  now = 1001;
  assert.equal(breaker.state(), 'half_open');
  breaker.recordSuccess();
  assert.equal(breaker.state(), 'closed');
});

test('window rate limiter blocks excess calls', () => {
  let now = 0;
  const limiter = new WindowRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
  assert.equal(limiter.allow(), true);
  assert.equal(limiter.allow(), true);
  assert.equal(limiter.allow(), false);
  now = 1001;
  assert.equal(limiter.allow(), true);
});

test('failure classifier distinguishes transient and permanent failures', () => {
  assert.equal(classifyApiFailure({ response: { status: 429 } }), 'transient');
  assert.equal(classifyApiFailure({ response: { status: 401 } }), 'permanent');
});

test('write operations are never automatically retried', () => {
  assert.equal(retryPolicy({ operation: 'write', error: { response: { status: 503 } } }).retry, false);
  assert.equal(retryPolicy({ operation: 'read', error: { response: { status: 503 } }, attempt: 1 }).retry, true);
});

test('protected reads fail closed when circuit is open', async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100000, now: () => 0 });
  breaker.recordFailure();
  let calls = 0;
  const result = await executeProtectedRead(async () => { calls += 1; return 'x'; }, { breaker, limiter: new WindowRateLimiter() });
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'circuit_open');
  assert.equal(calls, 0);
  assert.equal(result.writes_allowed, false);
});