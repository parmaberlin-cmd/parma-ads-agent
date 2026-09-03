const test = require('node:test');
const assert = require('node:assert/strict');
const { listConnections, connectionHealth, canUseCapability, humanActionNeeded } = require('../connection-registry');

test('connection registry exposes systems without secrets', () => {
  const rows = listConnections();
  assert.ok(rows.length >= 6);
  assert.ok(rows.some((x) => x.id === 'wix'));
  assert.ok(rows.some((x) => x.id === 'railway'));
  assert.equal(JSON.stringify(rows).includes('refresh_token'), false);
  assert.equal(JSON.stringify(rows).includes('api_key'), false);
});

test('verified read-only Google capability is usable', () => {
  const x = canUseCapability('google_ads', 'campaign_read');
  assert.equal(x.allowed, true);
});

test('mutations fail closed even on a connected provider', () => {
  const x = canUseCapability('google_ads', 'campaign_read', { mutation:true });
  assert.equal(x.allowed, false);
  assert.equal(x.reason, 'mutation_requires_separate_permission_class');
});

test('Wix and Railway remain blocked until direct backend access exists', () => {
  assert.equal(connectionHealth('wix').usable, false);
  assert.equal(connectionHealth('railway').usable, false);
  assert.equal(humanActionNeeded('wix').needed, true);
  assert.equal(humanActionNeeded('railway').needed, true);
});

test('unknown connection fails closed', () => {
  assert.equal(canUseCapability('unknown', 'read').allowed, false);
});
