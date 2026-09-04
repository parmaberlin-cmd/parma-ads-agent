'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildConnectionsView, buildConnectionsHealth, resolveCapability } = require('../connection-api');

test('connections view is read-only and secret-free', () => {
  const result = buildConnectionsView();
  assert.equal(result.success, true);
  assert.equal(result.mutation_permission, false);
  assert.ok(result.connections.length >= 6);
  const serialized = JSON.stringify(result).toLowerCase();
  assert.equal(serialized.includes('refresh_token'), false);
  assert.equal(serialized.includes('client_secret'), false);
  assert.equal(serialized.includes('access_token'), false);
});

test('health summary counts every registered connection', () => {
  const result = buildConnectionsHealth();
  assert.equal(result.summary.total, result.summary.usable + result.summary.blocked);
  assert.equal(result.mutation_permission, false);
});

test('resolver grants verified Google Railway and Wix read capabilities', () => {
  const google = resolveCapability({ connectionId: 'google_ads', capability: 'campaign_read' });
  const railway = resolveCapability({ connectionId: 'railway', capability: 'logs_read' });
  const wix = resolveCapability({ connectionId: 'wix', capability: 'reservation_read' });
  assert.equal(google.allowed, true);
  assert.equal(railway.allowed, true);
  assert.equal(wix.allowed, true);
  assert.equal(google.mutation_permission, false);
  assert.equal(railway.mutation_permission, false);
  assert.equal(wix.mutation_permission, false);
});

test('resolver blocks mutation even for verified read capability', () => {
  const result = resolveCapability({ connectionId: 'google_ads', capability: 'campaign_read', mutation: true });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'mutation_requires_separate_permission_class');
});

test('resolver fails closed for missing input and unmaterialized Wix aggregate capability', () => {
  assert.equal(resolveCapability({}).allowed, false);
  const wix = resolveCapability({ connectionId: 'wix', capability: 'reservation_aggregate_read' });
  assert.equal(wix.allowed, false);
  assert.equal(wix.health, 'healthy');
  assert.equal(wix.reason, 'capability_not_verified');
});
