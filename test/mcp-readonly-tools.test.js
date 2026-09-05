const test = require('node:test');
const assert = require('node:assert/strict');
const { createReadOnlyTools, listTools } = require('../mcp-readonly-tools');

function fixture(options = {}) {
  const calls = [];
  const tools = createReadOnlyTools({
    authorize: async () => true,
    read: async request => { calls.push(request); return { success: true, clicks: 17 }; },
    ...options,
  });
  return { ...tools, calls };
}

test('MCP preparation has only three explicitly read-only tools and fresh schemas', () => {
  const tools = listTools();
  assert.equal(tools.length, 3);
  assert.ok(tools.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint));
  tools[0].inputSchema.properties.injection = {};
  assert.equal(listTools()[0].inputSchema.properties.injection, undefined);
});

test('missing trusted adapters fail closed', () => {
  assert.throws(() => createReadOnlyTools());
  assert.throws(() => createReadOnlyTools({ authorize: () => true }));
});

test('maps intelligence to a fixed GET route, preserving campaign IDs and diagnostics', async () => {
  const f = fixture();
  const result = await f.callTool('parma_campaign_intelligence', { campaign_id: '23276824770' });
  assert.deepEqual(f.calls, [{ method: 'GET', path: '/tools/google/campaign/23276824770/intelligence', query: { days: 30 } }]);
  assert.equal(result.structuredContent.data.clicks, 17);
  assert.equal(result.structuredContent.writes_allowed, false);
});

test('maps days zero to an explicitly read-only today request', async () => {
  const f = fixture();
  await f.callTool('parma_campaign_intelligence', { campaign_id: '23276824770', days: 0 });
  assert.deepEqual(f.calls, [{ method: 'GET', path: '/tools/google/campaign/23276824770/intelligence', query: { days: 0 } }]);
});

test('fixed health and Google test routes accept no arbitrary destinations', async () => {
  const f = fixture();
  await f.callTool('parma_shadow_health');
  await f.callTool('parma_google_test');
  assert.deepEqual(f.calls.map(c => c.path), ['/health/agent-shadow-summary', '/tools/google/test']);
});

for (const [name, args] of [
  ['pause_campaign', {}], ['parma_google_test', { url: 'https://example.invalid' }],
  ['parma_google_test', { method: 'POST' }], ['parma_google_test', null],
  ['parma_campaign_intelligence', { campaign_id: '../start' }],
  ['parma_campaign_intelligence', { campaign_id: 23276824770 }],
  ['parma_campaign_intelligence', { campaign_id: '1', days: -1 }],
  ['parma_campaign_intelligence', { campaign_id: '1', days: 91 }],
  ['parma_campaign_intelligence', { campaign_id: '1', days: '30' }],
]) {
  test(`rejects unsupported input: ${name} ${JSON.stringify(args)}`, async () => {
    const f = fixture();
    assert.equal((await f.callTool(name, args)).isError, true);
    assert.equal(f.calls.length, 0);
  });
}

for (const verdict of [false, undefined, 'true', {}]) {
  test(`authorization requires exact true: ${JSON.stringify(verdict)}`, async () => {
    const f = fixture({ authorize: async () => verdict });
    assert.equal((await f.callTool('parma_google_test')).structuredContent.error, 'unauthorized');
    assert.equal(f.calls.length, 0);
  });
}

test('passes verified context and campaign scope to authorization, not to upstream', async () => {
  let checked;
  const f = fixture({ authorize: async (...args) => { checked = args; return true; } });
  await f.callTool('parma_campaign_intelligence', { campaign_id: '42', days: 90 }, { subject: 'owner' });
  assert.deepEqual(checked, [{ subject: 'owner' }, { scope: 'parma.read', campaignId: '42', tool: 'parma_campaign_intelligence' }]);
  assert.equal(f.calls[0].authContext, undefined);
});

test('authorization exceptions do not leak and never invoke upstream', async () => {
  const f = fixture({ authorize: async () => { throw new Error('private-auth-detail'); } });
  const result = await f.callTool('parma_google_test');
  assert.equal(f.calls.length, 0);
  assert.ok(!JSON.stringify(result).includes('private-auth-detail'));
});

for (const payload of [
  { nested: { clientSecret: 'example-secret' } },
  { message: 'Bearer example-sensitive-token' },
  { nested: ['some configured-private-value here'] },
  { success: false, error: 'provider-private-details' },
  null, 'not an object', ['not a result envelope'],
]) {
  test(`blocks unsafe/non-object provider output case ${JSON.stringify(payload).slice(0, 30)}`, async () => {
    const f = fixture({ read: async () => payload, knownSecrets: ['configured-private-value'] });
    const result = await f.callTool('parma_google_test');
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.data, undefined);
  });
}

test('upstream exceptions are generic and do not expose secrets', async () => {
  const f = fixture({ read: async () => { throw new Error('sensitive-detail'); } });
  assert.ok(!JSON.stringify(await f.callTool('parma_google_test')).includes('sensitive-detail'));
});
