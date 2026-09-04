const test = require('node:test');
const assert = require('node:assert/strict');
const { listConnections, connectionHealth, canUseCapability, humanActionNeeded } = require('../connection-registry');

test('connection registry exposes systems without secrets', () => {
  const rows = listConnections();
  assert.ok(rows.length >= 6);
  assert.ok(rows.some((x) => x.id === 'wix'));
  assert.ok(rows.some((x) => x.id === 'railway'));
  const text = JSON.stringify(rows).toLowerCase();
  assert.equal(text.includes('refresh_token'), false);
  assert.equal(text.includes('api_key'), false);
  assert.equal(text.includes('client_secret'), false);
  assert.equal(text.includes('access_token'), false);
});

test('verified read-only Google capability is usable', () => {
  const x = canUseCapability('google_ads', 'campaign_read');
  assert.equal(x.allowed, true);
  assert.equal(x.health, 'healthy');
});

test('mutations fail closed even on a connected provider', () => {
  const x = canUseCapability('google_ads', 'campaign_read', { mutation:true });
  assert.equal(x.allowed, false);
  assert.equal(x.reason, 'mutation_requires_separate_permission_class');
});

test('Railway direct reads are usable after live verification', () => {
  assert.equal(connectionHealth('railway').usable, true);
  assert.equal(connectionHealth('railway').health, 'healthy');
  assert.equal(canUseCapability('railway', 'logs_read').allowed, true);
  assert.equal(canUseCapability('railway', 'domain_read').allowed, true);
  assert.equal(humanActionNeeded('railway').needed, false);
});

test('Wix remains unavailable without inventing an owner gate', () => {
  assert.equal(connectionHealth('wix').usable, false);
  assert.equal(connectionHealth('wix').health, 'unavailable');
  assert.equal(canUseCapability('wix', 'reservation_aggregate_read').allowed, false);
  assert.equal(humanActionNeeded('wix').needed, false);
});

test('degraded Meta read can remain usable while writes stay separately gated', () => {
  assert.equal(connectionHealth('meta').health, 'degraded');
  assert.equal(connectionHealth('meta').usable, true);
  assert.equal(canUseCapability('meta', 'asset_read_partial').allowed, true);
  assert.equal(canUseCapability('meta', 'asset_read_partial', { mutation:true }).allowed, false);
});

test('unknown connection fails closed', () => {
  const health = connectionHealth('unknown');
  assert.equal(health.usable, false);
  assert.equal(health.health, 'unavailable');
  assert.equal(canUseCapability('unknown', 'read').allowed, false);
});
