const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { APPROVAL_TOKEN, META_API_VERSION } = require('../meta-paused-draft-next');
const {
  createWriteTransport,
  resolveApprovalToken,
  operationKey,
  acquireOperationLock,
  releaseOperationLock,
  sanitizeCreateResult,
  registerMetaSafeCreateRoute,
} = require('../meta-safe-create-route');

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

test('canonical approval_token matches OpenAPI and legacy confirmation remains compatible', () => {
  assert.deepEqual(resolveApprovalToken({ approval_token: APPROVAL_TOKEN }), { valid: true, reason: null, token: APPROVAL_TOKEN });
  assert.deepEqual(resolveApprovalToken({ confirmation: APPROVAL_TOKEN }), { valid: true, reason: null, token: APPROVAL_TOKEN });
});

test('conflicting approval fields fail closed', () => {
  const result = resolveApprovalToken({ approval_token: APPROVAL_TOKEN, confirmation: 'DIFFERENT' });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'conflicting_approval_tokens');
  assert.equal(result.token, null);
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
  const app = { post(route, fn) { assert.equal(route, '/tools/meta/reservation-draft/create'); handler = fn; } };
  registerMetaSafeCreateRoute(app, { authorized: () => true, env: {} });
  const res = responseStub();
  await handler({ body: {} }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.activates_spend, false);
});

test('kill switch blocks even with canonical approval token', async () => {
  let handler;
  const app = { post(route, fn) { handler = fn; } };
  registerMetaSafeCreateRoute(app, { authorized: () => true, env: { PARMA_AGENT_KILL_SWITCH: 'true' } });
  const res = responseStub();
  await handler({ body: { approval_token: APPROVAL_TOKEN } }, res);
  assert.equal(res.statusCode, 423);
  assert.equal(res.body.blocked, true);
  assert.equal(res.body.reason, 'kill_switch_enabled');
});

test('equivalent start instants use the same operation key', () => {
  const env = { META_AD_ACCOUNT_ID: '123' };
  const first = operationKey({ env, startsAt: '2030-08-24T15:00:00.000Z' });
  const second = operationKey({ env, startsAt: '2030-08-24T17:00:00.000+02:00' });
  assert.equal(first, second);
});

test('identical operations are mutually exclusive while in flight', () => {
  const key = 'same-operation';
  releaseOperationLock(key);
  assert.equal(acquireOperationLock(key), true);
  assert.equal(acquireOperationLock(key), false);
  releaseOperationLock(key);
  assert.equal(acquireOperationLock(key), true);
  releaseOperationLock(key);
});

test('bootstrap clears legacy startup one-shot before server load', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'bootstrap.js'), 'utf8');
  const disableIndex = source.indexOf('process.env.META_PAUSED_DRAFT_ONE_SHOT = ""');
  const serverIndex = source.indexOf('require("./server")');
  assert.ok(disableIndex >= 0);
  assert.ok(serverIndex > disableIndex);
});