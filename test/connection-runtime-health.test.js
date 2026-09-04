const test = require('node:test');
const assert = require('node:assert/strict');
const { runtimeEvidence, buildRuntimeConnectionHealth } = require('../connection-runtime-health');

test('runtime evidence reports configuration presence without exposing values', () => {
  const env = {
    GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', GOOGLE_DEVELOPER_TOKEN: 'z', GOOGLE_REFRESH_TOKEN: 'r', GOOGLE_CUSTOMER_ID: 'c',
    META_ACCESS_TOKEN: 'm', META_AD_ACCOUNT_ID: 'a',
    WIX_ACCESS_TOKEN: 'w', RAILWAY_TOKEN: 'rr', GITHUB_TOKEN: 'g'
  };
  const x = runtimeEvidence(env);
  assert.equal(x.google_ads.configured, true);
  assert.equal(x.meta.configured, true);
  assert.equal(x.wix.configured, true);
  assert.equal(x.railway.configured, true);
  assert.equal(JSON.stringify(x).includes('GOOGLE_CLIENT_SECRET'), false);
  assert.equal(JSON.stringify(x).includes('META_ACCESS_TOKEN'), false);
  assert.equal(JSON.stringify(x).includes('WIX_ACCESS_TOKEN'), false);
});

test('runtime snapshot distinguishes configured from verified live health', () => {
  const x = buildRuntimeConnectionHealth({ WIX_ACCESS_TOKEN: 'present' });
  const wix = x.connections.find((c) => c.id === 'wix');
  assert.equal(wix.backend_credentials_configured, true);
  assert.equal(wix.verified_live_health, false);
  assert.equal(wix.live_probe_required, true);
  assert.equal(x.external_calls_performed, false);
  assert.equal(x.mutation_permission, false);
});

test('missing provider credentials fail closed', () => {
  const x = buildRuntimeConnectionHealth({});
  const railway = x.connections.find((c) => c.id === 'railway');
  assert.equal(railway.backend_credentials_configured, false);
  assert.equal(railway.verified_live_health, false);
});
