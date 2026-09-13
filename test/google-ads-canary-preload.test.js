'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizedCanaryResult, runStartupCanary } = require('../google-ads-canary-preload');

test('startup canary is disabled unless an exact mode is configured', async () => {
  const env = { GOOGLE_ADS_CANARY_STARTUP_MODE: 'execute' };
  const result = await runStartupCanary({ env, log: () => assert.fail('must not log') });
  assert.equal(result.status, 'disabled');
  assert.equal(env.GOOGLE_ADS_CANARY_STARTUP_MODE, '');
});

test('startup canary output is a fixed sanitized zero-spend contract', () => {
  const safe = sanitizedCanaryResult({
    status: 'BLOCKED',
    blockers: ['execution_not_authorized'],
    token: 'must-not-appear',
    spend_allowed: true,
    activation_authorized: true,
  });
  assert.equal(safe.spend_allowed, false);
  assert.equal(safe.activation_authorized, false);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, 'token'), false);
});
