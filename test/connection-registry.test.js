const test = require('node:test');
const assert = require('node:assert/strict');
const { listConnections, connectionHealth, canUseCapability, humanActionNeeded } = require('../connection-registry');

test('connection registry exposes systems without secrets', () => {
  const rows = listConnections();
  assert.ok(rows.length >= 7);
  assert.ok(rows.some((x) => x.id === 'wix'));
  assert.ok(rows.some((x) => x.id === 'railway'));
  assert.ok(rows.some((x) => x.id === 'orderbird'));
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

test('Railway verified direct reads are usable', () => {
  assert.equal(connectionHealth('railway').usable, true);
  assert.equal(connectionHealth('railway').health, 'healthy');
  for (const capability of ['logs_read','domain_read','service_config_read','metrics_read']) {
    assert.equal(canUseCapability('railway', capability).allowed, true, capability);
  }
  assert.equal(humanActionNeeded('railway').needed, false);
});

test('Wix verified direct reservation reads are usable while mutations remain gated', () => {
  assert.equal(connectionHealth('wix').usable, true);
  assert.equal(connectionHealth('wix').health, 'healthy');
  assert.equal(canUseCapability('wix', 'reservation_read').allowed, true);
  assert.equal(canUseCapability('wix', 'reservation_status_read').allowed, true);
  assert.equal(canUseCapability('wix', 'reservation_aggregate_read').allowed, false);
  assert.equal(canUseCapability('wix', 'reservation_read', { mutation:true }).allowed, false);
  assert.equal(humanActionNeeded('wix').needed, false);
});

test('orderbird automatic read target fails closed until provider-supported access is verified', () => {
  const health = connectionHealth('orderbird');
  assert.equal(health.found, true);
  assert.equal(health.health, 'unavailable');
  assert.equal(health.usable, false);
  assert.equal(health.autonomous_read_allowed, false);
  assert.equal(canUseCapability('orderbird', 'revenue_daily_read').allowed, false);
  assert.equal(canUseCapability('orderbird', 'revenue_daily_read').reason, 'connection_not_usable');
  assert.equal(humanActionNeeded('orderbird').needed, false);
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
