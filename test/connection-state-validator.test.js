'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../state/CONNECTION_REGISTRY.json');
const delegation = require('../state/DELEGATION_POLICY.json');
const { findForbiddenKeys, assertSecretFreeSharedState } = require('../connection-state-validator');

test('current shared registry and delegation state contain no secret-shaped keys', () => {
  assert.deepEqual(findForbiddenKeys(registry), []);
  assert.deepEqual(findForbiddenKeys(delegation), []);
  assert.equal(assertSecretFreeSharedState(registry), true);
  assert.equal(assertSecretFreeSharedState(delegation), true);
});

test('guard detects nested secret-shaped keys without inspecting secret values', () => {
  const sample = { provider: { refresh_token: 'redacted', nested: [{ apiKey: 'redacted' }] } };
  const hits = findForbiddenKeys(sample);
  assert.ok(hits.some((x) => x.endsWith('.refresh_token')));
  assert.ok(hits.some((x) => x.endsWith('.apiKey')));
  assert.throws(() => assertSecretFreeSharedState(sample), { code: 'FORBIDDEN_SECRET_SHAPED_KEYS' });
});
