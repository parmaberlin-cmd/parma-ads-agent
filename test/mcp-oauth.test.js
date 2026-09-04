const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const http = require('node:http');
const { FileTokenStore } = require('../mcp-auth-store');
const { ParmaOAuthProvider, challenge, COOKIE, hash } = require('../mcp-oauth-provider');
const { installMcp, configuration, createLocalReader } = require('../mcp-server');

const origin = 'https://parma.example';
const verifier = 'v'.repeat(43);
function environment(directory = '/data/mcp-auth') {
  return {
    PARMA_MCP_ENABLED: 'true', PARMA_MCP_PUBLIC_ORIGIN: origin, PARMA_MCP_OWNER_EMAIL: 'owner@example.com',
    PARMA_MCP_CLIENT_ID: 'test-client', PARMA_MCP_CLIENT_SECRET: 's'.repeat(40),
    PARMA_MCP_REDIRECT_URI: 'https://chatgpt.com/connector_platform_oauth_redirect',
    PARMA_MCP_GOOGLE_CLIENT_ID: 'test-google-client', PARMA_MCP_GOOGLE_CLIENT_SECRET: 'test-google-secret',
    PARMA_MCP_STATE_DIR: directory, PARMA_MCP_STORE_KEY: 'k'.repeat(43), PARMA_AGENT_API_KEY: 'test-internal-key',
    PARMA_MCP_SINGLE_REPLICA_CONFIRMED: 'true', PORT: '3000',
  };
}
function fixture() {
  let state = { version: 1, tokens: {} }, time = Date.now(), googleParams;
  const config = configuration(environment());
  const store = { snapshot: () => structuredClone(state), save: next => { state = structuredClone(next); } };
  let identityOverrides = {};
  const google = {
    generateAuthUrl: params => { googleParams = params; return 'https://accounts.google.com/o/oauth2/v2/auth'; },
    getToken: async () => ({ tokens: { id_token: 'mock-google-id-token' } }),
    verifyIdToken: async () => ({ getPayload: () => ({
      email: config.ownerEmail, email_verified: true, sub: 'owner-subject', nonce: googleParams.nonce,
      iss: 'https://accounts.google.com', aud: config.googleClientId, exp: time / 1000 + 3600, ...identityOverrides,
    }) }),
  };
  const provider = new ParmaOAuthProvider({ config, store, google, now: () => time });
  const client = { client_id: config.clientId };
  async function begin() {
    let cookie;
    await provider.authorize(client, { state: 'chatgpt-state', scopes: ['parma.read'], codeChallenge: challenge(verifier),
      redirectUri: config.redirectUri, resource: new URL(config.resource) }, {
      cookie: (name, value) => { assert.equal(name, COOKIE); cookie = value; }, redirect: () => {},
    });
    return { state: googleParams.state, cookie, code: 'mock-google-code' };
  }
  async function grant() {
    const flow = await begin();
    const { csrf } = await provider.finishGoogle(flow);
    const url = new URL(provider.consent({ ...flow, csrf, approved: true }));
    assert.equal(url.searchParams.get('state'), 'chatgpt-state');
    assert.equal(url.searchParams.get('iss'), config.issuer);
    return url.searchParams.get('code');
  }
  const exchange = code => provider.exchangeAuthorizationCode(client, code, undefined, config.redirectUri, new URL(config.resource));
  return { provider, config, client, store, google, begin, grant, exchange,
    overrideIdentity: values => { identityOverrides = values; }, advance: ms => { time += ms; } };
}

test('configuration is disabled by default; requires all safety prerequisites when enabled', () => {
  assert.equal(configuration({}), null);
  for (const key of Object.keys(environment())) {
    if (key === 'PORT' || key === 'PARMA_MCP_ENABLED') continue;
    const env = environment(); delete env[key];
    assert.throws(() => configuration(env), key);
  }
  for (const patch of [{ PARMA_MCP_PUBLIC_ORIGIN: 'http://parma.example' },
    { PARMA_MCP_PUBLIC_ORIGIN: `${origin}/mcp` }, { PARMA_MCP_REDIRECT_URI: 'https://evil.example/callback' },
    { PARMA_MCP_REDIRECT_URI: 'https://chatgpt.com/anything' }, { PARMA_MCP_STATE_DIR: '/' },
    { PARMA_MCP_SINGLE_REPLICA_CONFIRMED: 'false' }, { PORT: 'NaN' }]) {
    assert.throws(() => configuration({ ...environment(), ...patch }));
  }
});

test('owner sign-in, consent and single-use authorization code produce resource-bound read tokens', async () => {
  const f = fixture(), code = await f.grant();
  assert.equal(await f.provider.challengeForAuthorizationCode(f.client, code), challenge(verifier));
  const tokens = await f.exchange(code);
  const auth = await f.provider.verifyAccessToken(tokens.access_token);
  assert.deepEqual(auth.scopes, ['parma.read']);
  assert.equal(auth.resource.href, f.config.resource);
  await assert.rejects(() => f.exchange(code));
  assert.ok(!JSON.stringify(f.store.snapshot()).includes(tokens.access_token));
  assert.ok(!JSON.stringify(f.store.snapshot()).includes(tokens.refresh_token));
});

for (const identity of [{ email: 'someone-else@example.com' }, { email_verified: false },
  { nonce: 'wrong' }, { iss: 'https://evil.example' }, { aud: 'other-client' }, { exp: 0 }, { sub: '' }]) {
  test(`rejects wrong Google identity: ${Object.keys(identity)[0]}`, async () => {
    const f = fixture(), flow = await f.begin(); f.overrideIdentity(identity);
    await assert.rejects(() => f.provider.finishGoogle(flow));
    assert.equal(f.provider.pending.size, 0);
    assert.deepEqual(f.store.snapshot().tokens, {});
  });
}

test('wrong browser cookie and callback replay are rejected', async () => {
  const f = fixture(), flow = await f.begin();
  await assert.rejects(() => f.provider.finishGoogle({ ...flow, cookie: 'w'.repeat(43) }));
  await f.provider.finishGoogle(flow);
  await assert.rejects(() => f.provider.finishGoogle(flow));
});
test('Google callback races can only exchange once', async () => {
  const f = fixture(), flow = await f.begin();
  const results = await Promise.allSettled([f.provider.finishGoogle(flow), f.provider.finishGoogle(flow)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
test('consent requires CSRF token and supports deny without issuing a grant', async () => {
  const f = fixture(), flow = await f.begin(), { csrf } = await f.provider.finishGoogle(flow);
  assert.throws(() => f.provider.consent({ ...flow, csrf: 'x'.repeat(43), approved: true }));
  const destination = new URL(f.provider.consent({ ...flow, csrf, approved: false }));
  assert.equal(destination.searchParams.get('error'), 'access_denied');
  assert.equal(destination.searchParams.get('code'), null);
  assert.equal(f.provider.codes.size, 0);
});
test('expired sign-in and authorization codes cannot be used', async () => {
  const f = fixture(), flow = await f.begin(); f.advance(600001);
  await assert.rejects(() => f.provider.finishGoogle(flow));
  const code = await f.grant(); f.advance(60001);
  await assert.rejects(() => f.exchange(code));
});
test('wrong audience, client and redirect URI cannot exchange a code', async () => {
  const f = fixture(), code = await f.grant();
  await assert.rejects(() => f.provider.exchangeAuthorizationCode(f.client, code, undefined, f.config.redirectUri, new URL('https://evil.example')));
  await assert.rejects(() => f.provider.exchangeAuthorizationCode({ client_id: 'wrong' }, code, undefined, f.config.redirectUri, new URL(f.config.resource)));
  await assert.rejects(() => f.provider.exchangeAuthorizationCode(f.client, code, undefined, 'https://evil.example', new URL(f.config.resource)));
});
test('token expiry, refresh rotation, reuse detection, and revocation are enforced', async () => {
  const f = fixture(), tokens = await f.exchange(await f.grant());
  f.advance(3600001);
  await assert.rejects(() => f.provider.verifyAccessToken(tokens.access_token));
  const rotated = await f.provider.exchangeRefreshToken(f.client, tokens.refresh_token, ['parma.read'], new URL(f.config.resource));
  await f.provider.verifyAccessToken(rotated.access_token);
  await assert.rejects(() => f.provider.exchangeRefreshToken(f.client, tokens.refresh_token, ['parma.read'], new URL(f.config.resource)));
  await assert.rejects(() => f.provider.verifyAccessToken(rotated.access_token));
  const next = await f.exchange(await f.grant());
  await f.provider.revokeToken(f.client, { token: next.refresh_token });
  await assert.rejects(() => f.provider.verifyAccessToken(next.access_token));
});
test('refresh cannot escalate scopes or audience', async () => {
  const f = fixture(), tokens = await f.exchange(await f.grant());
  await assert.rejects(() => f.provider.exchangeRefreshToken(f.client, tokens.refresh_token, ['parma.write'], new URL(f.config.resource)));
  await assert.rejects(() => f.provider.exchangeRefreshToken(f.client, tokens.refresh_token, ['parma.read'], new URL('https://evil.example')));
});
test('token persistence failure does not return a usable grant', async () => {
  const f = fixture(), code = await f.grant();
  f.store.save = () => { throw new Error('disk unavailable'); };
  await assert.rejects(() => f.exchange(code));
  assert.deepEqual(f.store.snapshot().tokens, {});
});
test('tampered record identity/resource is not accepted', async () => {
  const f = fixture(), tokens = await f.exchange(await f.grant());
  const state = f.store.snapshot(); state.tokens[hash(tokens.access_token)].resource = 'https://evil.example'; f.store.save(state);
  await assert.rejects(() => f.provider.verifyAccessToken(tokens.access_token));
});

test('file store persists across restart with integrity protection and private permissions', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'parma-mcp-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'mcp-auth'), key = 'k'.repeat(43);
  const store = new FileTokenStore(directory, key);
  store.save({ version: 1, tokens: { example_hash: { type: 'refresh', expires: 42 } } });
  assert.deepEqual(new FileTokenStore(directory, key).snapshot(), store.snapshot());
  assert.equal(fs.statSync(path.join(directory, 'tokens.json')).mode & 0o777, 0o600);
  assert.throws(() => new FileTokenStore(directory, 'z'.repeat(43)));
  const file = path.join(directory, 'tokens.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('refresh', 'access'));
  assert.throws(() => new FileTokenStore(directory, key));
});

test('local reader enforces destination, method, parameter and response boundaries', async () => {
  let captured;
  const reader = createLocalReader(configuration(environment()), { get: async (...args) => {
    captured = args; return { data: { success: true, connected: true, account: null, debug: 'not exposed' } };
  } });
  assert.deepEqual(await reader({ method: 'GET', path: '/tools/google/test', query: {} }), { success: true, connected: true, account: null });
  assert.equal(captured[0], 'http://127.0.0.1:3000/tools/google/test');
  assert.equal(captured[1].maxRedirects, 0);
  assert.equal(captured[1].proxy, false);
  for (const request of [{ method: 'POST', path: '/tools/google/test', query: {} },
    { method: 'GET', path: 'https://evil.example', query: {} },
    { method: 'GET', path: '/tools/google/test', query: { url: 'evil' } },
    { method: 'GET', path: '/tools/google/campaign/1/intelligence', query: { days: 91 } }]) {
    await assert.rejects(() => reader(request));
  }
});

test('concurrent store handles cannot overwrite a newer token rotation', t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'parma-mcp-race-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'mcp-auth'), key = 'k'.repeat(43);
  const first = new FileTokenStore(directory, key), second = new FileTokenStore(directory, key);
  const stale = second.snapshot();
  first.save({ version: 1, tokens: { rotated: { type: 'access', expires: 42 } } });
  assert.throws(() => second.save(stale), /conflict/);
  assert.deepEqual(second.snapshot(), first.snapshot());
});

async function httpFixture(t, enabled = true) {
  const f = fixture(), app = express();
  const mounted = installMcp(app, { env: enabled ? environment() : {}, store: f.store, google: f.google,
    read: async () => ({ success: true, clicks: 7 }) });
  app.use((req, res) => res.status(404).end());
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (endpoint, options = {}) => new Promise((resolve, reject) => {
    const req = http.request(base + endpoint, { method: options.method || 'GET',
      headers: { host: 'parma.example', ...options.headers } }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode,
        headers: { get: key => res.headers[key.toLowerCase()] }, json: async () => JSON.parse(body), text: async () => body }));
    });
    req.on('error', reject);
    req.end(options.body ? String(options.body) : undefined);
  });
  return { ...f, mounted, request };
}
test('disabled installation exposes only safe health, not OAuth or MCP', async t => {
  const f = await httpFixture(t, false);
  assert.equal((await (await f.request('/health/mcp')).json()).enabled, false);
  assert.equal((await f.request('/mcp')).status, 404);
  assert.equal((await f.request('/.well-known/oauth-authorization-server')).status, 404);
});
test('OAuth metadata is discoverable and unauthenticated MCP is challenged', async t => {
  const f = await httpFixture(t);
  const metadata = await (await f.request('/.well-known/oauth-authorization-server')).json();
  assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
  assert.equal(metadata.authorization_response_iss_parameter_supported, true);
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ['client_secret_post']);
  assert.equal(metadata.registration_endpoint, undefined);
  assert.ok(!JSON.stringify(metadata).includes(f.config.clientSecret));
  const response = await f.request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /oauth-protected-resource\/mcp/);
  assert.equal((await f.request('/mcp', { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.request('/mcp', { headers: { host: 'evil.example' } })).status, 403);
  const invalidScope = new URLSearchParams({ client_id: f.config.clientId, redirect_uri: f.config.redirectUri,
    response_type: 'code', code_challenge: challenge(verifier), code_challenge_method: 'S256', scope: 'parma.write',
    state: 'preserved-state', resource: f.config.resource });
  const denied = await f.request(`/authorize?${invalidScope}`);
  assert.equal(denied.status, 302);
  const destination = new URL(denied.headers.get('location'));
  assert.equal(destination.searchParams.get('iss'), f.config.issuer);
  assert.equal(destination.searchParams.get('error'), 'invalid_scope');
  assert.equal(destination.searchParams.get('state'), 'preserved-state');
});
test('consent page preserves form Origin without disclosing callback query; rejects unsafe submissions', async t => {
  const f = await httpFixture(t), provider = f.mounted.provider;
  let flowCookie, googleState;
  const original = f.google.generateAuthUrl;
  f.google.generateAuthUrl = params => { googleState = params.state; return original(params); };
  await provider.authorize(f.client, { state: 'chatgpt-state', scopes: ['parma.read'], codeChallenge: challenge(verifier),
    redirectUri: f.config.redirectUri, resource: new URL(f.config.resource) }, {
    cookie: (_, value) => { flowCookie = value; }, redirect: () => {},
  });
  const page = await f.request(`/mcp/oauth/google/callback?state=${googleState}&code=mock-google-code`, {
    headers: { cookie: `${COOKIE}=${flowCookie}` },
  });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('referrer-policy'), 'strict-origin');
  assert.match(page.headers.get('content-security-policy'), /form-action 'self'/);
  const csrf = (await page.text()).match(/name="csrf" value="([^"]+)"/)[1];
  const submit = (requestOrigin, overrides = {}, cookie = flowCookie) => f.request('/mcp/oauth/consent', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded',
      ...(requestOrigin === undefined ? {} : { origin: requestOrigin }), cookie: `${COOKIE}=${cookie}` },
    body: new URLSearchParams({ state: googleState, csrf, decision: 'allow', ...overrides }),
  });
  for (const bad of ['null', 'https://evil.example']) assert.equal((await submit(bad)).status, 403);
  for (const bad of [undefined, 'https://chatgpt.com']) assert.equal((await submit(bad)).status, 400);
  assert.equal((await submit(origin, { csrf: 'invalid' })).status, 400);
  assert.equal((await submit(origin, {}, 'wrong-cookie')).status, 400);
  const accepted = await submit(origin);
  assert.equal(accepted.status, 302);
  assert.equal(new URL(accepted.headers.get('location')).origin, 'https://chatgpt.com');
  assert.equal(accepted.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await submit(origin)).status, 400);
});
test('real SDK transport initializes, lists and calls only read tools', async t => {
  const f = await httpFixture(t);
  const tokens = f.mounted.provider.issue({ subject: 'owner-subject', family: 'test-family', familyExpires: Date.now() + 86400000 });
  const rpc = async (method, params = {}) => {
    const response = await f.request('/mcp', { method: 'POST', headers: {
      authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(initialized.result.serverInfo.name, 'parma-readonly');
  const listed = await rpc('tools/list');
  assert.equal(listed.result.tools.length, 3);
  const called = await rpc('tools/call', { name: 'parma_google_test', arguments: {} });
  assert.equal(called.result.structuredContent.data.clicks, 7);
  const rejected = await rpc('tools/call', { name: 'pause_campaign', arguments: {} });
  assert.ok(rejected.error || rejected.result?.isError);
});
test('SDK token endpoint validates client secret and PKCE before issuing tokens', async t => {
  const f = await httpFixture(t), provider = f.mounted.provider;
  let flowCookie, googleState;
  const original = f.google.generateAuthUrl;
  f.google.generateAuthUrl = params => { googleState = params.state; return original(params); };
  await provider.authorize(f.client, { state: 'client-state', scopes: ['parma.read'], codeChallenge: challenge(verifier),
    redirectUri: f.config.redirectUri, resource: new URL(f.config.resource) }, { cookie: (_, value) => { flowCookie = value; }, redirect: () => {} });
  const flow = { state: googleState, cookie: flowCookie, code: 'mock-code' };
  const { csrf } = await provider.finishGoogle(flow);
  const code = new URL(provider.consent({ ...flow, csrf, approved: true })).searchParams.get('code');
  const body = { grant_type: 'authorization_code', client_id: f.config.clientId, client_secret: f.config.clientSecret,
    code, code_verifier: verifier, redirect_uri: f.config.redirectUri, resource: f.config.resource };
  const exchange = fields => f.request('/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
  assert.equal((await exchange({ ...body, client_secret: 'wrong' })).status, 401);
  assert.equal((await exchange({ ...body, code_verifier: 'w'.repeat(43) })).status, 400);
  const valid = await exchange(body);
  assert.equal(valid.status, 200);
  const tokens = await valid.json();
  await provider.verifyAccessToken(tokens.access_token);
  assert.equal((await exchange(body)).status, 400);
});
