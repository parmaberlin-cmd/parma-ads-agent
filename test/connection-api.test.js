'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildConnectionsView,
  buildConnectionsHealth,
  resolveCapability,
} = require('../connection-api');

test('connections view is read-only and secret-free', () => {
  const result = buildConnectionsView();
  assert.equal(result.success, true);
  assert.equal(result.mutation_permission, false);
  assert.ok(result.connections.length >= 6);
  const serialized = JSON.stringify(result).toLowerCase();
  assert.equal(serialized.includes('refresh_token'), false);
  assert.equal(serialized.includes('client_secret'), false);
});

test('health summary counts every registered connection', () => {
  const result = buildConnectionsHealth();
  assert.equal(result.summary.total, result.summary.usable + result.summary.blocked);
  assert.equal(result.mutation_permission, false);
});

test('resolver grants verified Google read capability', () => {
  const result = resolveCapability({ connectionId: 'google_ads', capability: 'campaign_read' });
  assert.equal(result.allowed, true);
  assert.equal(result.mutation_permission, false);
});

test('resolver blocks mutation even for verified read capability', () => {
  const result = resolveCapability({ connectionId: 'google_ads', capability: 'campaign_read', mutation: true });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'mutation_requires_separate_permission_class');
});

test('resolver fails closed for missing input and blocked Wix capability', () => {
  assert.equal(resolveCapability({}).allowed, false);
  const wix = resolveCapability({ connectionId: 'wix', capability: 'reservation_read' });
  assert.equal(wix.allowed, false);
});
