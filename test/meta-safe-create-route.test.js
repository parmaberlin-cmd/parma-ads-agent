const test = require('node:test');
const assert = require('node:assert/strict');
const { APPROVAL_TOKEN, META_API_VERSION } = require('../meta-paused-draft-next');
const { createWriteTransport, sanitizeCreateResult, registerMetaSafeCreateRoute } = require('../meta-safe-create-route');

function responseStub() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('write transport pins the current Meta API generation', () => {
  let config;
  const client = {
    create(input) {
      config = input;
      return { get: async () => ({ data: {} }), post: async () => ({ data: {} }) };
    },
  };
  createWriteTransport({ accessToken: 'token', apiVersion: META_API_VERSION, client });
  assert.equal(config.baseURL, `https://graph.facebook.com/${META_API_VERSION}`);
});

test('sanitized create result never exposes Meta object ids', () => {
  const safe = sanitizeCreateResult({
    success: true,
    operation_key: 'abc',
    created: { campaign_id: '123456789', adset_id: '987654321' },
    verification: { campaign_id: { id: '123456789', status: 'PAUSED', effective_status: 'PAUSED' } },
  });
  assert.deepEqual(safe.created_stages, ['campaign', 'adset']);
  assert.equal(JSON.stringify(safe).includes('123456789'), false);
  assert.equal(safe.activates_spend, false);
});

test('safe create route rejects missing exact approval before any network work', async () => {
  let handler;
  const app = { post(path, fn) { assert.equal(path, '/tools/meta/reservation-draft/create'); handler = fn; } };
  registerMetaSafeCreateRoute(app, { authorized: () => true, env: {} });
  const res = responseStub();
  await handler({ body: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.activates_spend, false);
});

test('kill switch blocks even with the exact approval token', async () => {
  let handler;
  const app = { post(path, fn) { handler = fn; } };
  registerMetaSafeCreateRoute(app, { authorized: () => true, env: { PARMA_AGENT_KILL_SWITCH: 'true' } });
  const res = responseStub();
  await handler({ body: { confirmation: APPROVAL_TOKEN } }, res);
  assert.equal(res.statusCode, 423);
  assert.equal(res.body.blocked, true);
  assert.equal(res.body.reason, 'kill_switch_enabled');
});