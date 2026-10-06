const test = require('node:test');
const assert = require('node:assert/strict');
const { run, state, register, exceptionCategory } = require('../meta-preflight-status');
const { executeRuntimeMetaPreflight } = require('../meta-runtime-preflight');

test('exception categories use only allowlisted structured codes, never messages', () => {
  for (const [error, expected] of [
    [{ response: { status: 401 } }, 'authentication'],
    [{ response: { data: { error: { code: 190 } } } }, 'authentication'],
    [{ response: { status: 403 } }, 'permission'],
    [{ response: { data: { error: { code: 200 } } } }, 'permission'],
    [{ response: { status: 429 } }, 'rate_limit'],
    [{ response: { data: { error: { code: 613 } } } }, 'rate_limit'],
    [{ code: 'ETIMEDOUT' }, 'timeout'],
    [{ code: 'ECONNABORTED' }, 'timeout'],
    [{ code: 'ECONNRESET' }, 'network'],
    [{ response: { status: 503 } }, 'provider_unavailable'],
    [{ response: { status: 400 } }, 'provider_request'],
    [{ message: 'invalid token authentication permission timeout' }, 'unknown'],
    [{ code: 'secret-code', response: { status: '401' } }, 'unknown'],
    [null, 'unknown'], ['raw-secret', 'unknown'],
  ]) assert.equal(exceptionCategory(error), expected);
  const hostile = new Proxy({}, { get() { throw new Error('private'); } });
  assert.equal(exceptionCategory(hostile), 'unknown');
});

test('real read-only executor reports the phase at transport/account/asset exceptions', async () => {
  for (const failAt of ['transport', 'account_read', 'asset_read']) {
    const phases = [];
    let calls = 0;
    const error = new Error('provider-private-payload');
    await assert.rejects(executeRuntimeMetaPreflight({
      env: { META_ACCESS_TOKEN: 'fixture', META_AD_ACCOUNT_ID: '123', META_AD_DSA_BENEFICIARY: 'Parma', META_AD_DSA_PAYOR: 'Parma' },
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      onPhase: phase => phases.push(phase),
      httpClient: { create() {
        if (failAt === 'transport') throw error;
        return { async get() {
          calls++;
          if (failAt === 'account_read' || calls > 1) throw error;
          return { data: { account_status: 1, currency: 'EUR', timezone_name: 'Europe/Berlin' } };
        } };
      } },
    }), failAt === 'asset_read' ? /No Instagram account/ : error);
    assert.equal(phases.at(-1), failAt);
    if (failAt === 'asset_read') assert.ok(calls > 1);
    else assert.equal(calls, failAt === 'transport' ? 0 : 1);
  }
});

test('failed startup logs only fixed diagnostic fields, clears stale PASS and keeps HTTP 500', async () => {
  const secret = 'private-marker-987654321098765';
  const cases = [
    Object.assign(new Error(secret), {
      stack: secret, token: secret, headers: { authorization: secret },
      config: { url: `https://example.invalid/?access_token=${secret}` },
      response: { status: 401, data: { id: secret, error: { message: secret, code: 190 } } },
      toJSON() { throw new Error('must never serialize provider error'); },
    }),
    new Proxy({}, { get() { throw new Error(secret); } }),
    { code: secret, response: { status: secret, data: secret } },
  ];
  const logs = [];
  const originalError = console.error;
  console.error = line => logs.push(line);
  try {
    for (const [index, error] of cases.entries()) {
      state.result = { ready: true, read_only_ready: true };
      await run({ execute: async ({ onPhase }) => {
        onPhase(index === 0 ? 'asset_read' : secret);
        throw error;
      } });
      assert.equal(state.status, 'failed');
      assert.equal(state.result, null);
      assert.equal(state.error, 'meta_runtime_preflight_failed');
      const logged = JSON.parse(logs.at(-1));
      assert.deepEqual(logged, {
        event: 'meta_runtime_preflight', success: false, error: 'meta_runtime_preflight_failed',
        diagnostic: { phase: index === 0 ? 'asset_read' : 'unknown', category: index === 0 ? 'authentication' : 'unknown' },
        mode: 'read_only', may_activate: false, may_spend: false,
      });
      let handler;
      register({ get(path, callback) { handler = callback; } });
      const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      handler({}, res);
      assert.equal(res.statusCode, 500);
      assert.equal(res.body.success, false);
      assert.equal(res.body.may_spend, false);
      assert.equal(res.body.may_activate, false);
      assert.equal(res.body.diagnostic, undefined);
      assert.ok(!JSON.stringify([logged, res.body, state.diagnostic]).includes(secret));
    }
  } finally { console.error = originalError; }
});

test('exception during result validation stays failed and never logs a successful result', async () => {
  const logs = [];
  const originalError = console.error;
  const originalLog = console.log;
  console.error = line => logs.push(JSON.parse(line));
  console.log = () => assert.fail('no PASS log on an exception');
  try {
    await run({ execute: async () => ({ get read_only_ready() { throw new Error('private'); } }) });
    assert.equal(state.status, 'failed');
    assert.deepEqual(state.diagnostic, { phase: 'result_validation', category: 'unknown' });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].success, false);
  } finally { console.error = originalError; console.log = originalLog; }
});
