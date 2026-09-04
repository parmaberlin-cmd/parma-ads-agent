const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createRequire } = require('node:module');
const sdkRequire = createRequire(require.resolve('google-ads-api'));
const { Parser, parser } = sdkRequire('stream-json');
const { streamArray } = sdkRequire('stream-json/streamers/StreamArray');
const { chain } = sdkRequire('stream-chain');

async function collect(input, packed = false) {
  const p = packed ? new Parser({ streamValues: false, streamKeys: false, packValues: true, packKeys: true }) : parser();
  const pipeline = chain([Readable.from(input), p, streamArray()]);
  const result = [];
  try { for await (const item of pipeline) result.push(item); }
  finally { pipeline.destroy(); p.destroy(); }
  return result;
}
test('Google Ads SDK loads unchanged with patched parser facade', () => {
  assert.equal(typeof require('google-ads-api').GoogleAdsApi, 'function');
  assert.throws(() => sdkRequire('stream-json/filters/Pick'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
});
for (const packed of [false, true]) test(`SDK parser contract preserves streamed rows and summary (packed=${packed})`, async () => {
  const values = [{ results: [{ campaign: { id: '23276824770', name: 'Pizza 🍕' }, metrics: { costMicros: '12345678901234567', clicks: '2' } }] },
    { summaryRow: { metrics: { clicks: '2' } } }];
  const bytes = Buffer.from(JSON.stringify(values));
  assert.deepEqual(await collect(Array.from(bytes, b => Buffer.from([b])), packed), values.map((value, key) => ({ key, value })));
  assert.deepEqual(await collect(['[]'], packed), []);
  await assert.rejects(collect(['[{"bad":'], packed));
});
test('SDK error response parser retains Google error envelope', async () => {
  const error = { error: { code: 400, message: 'test', details: [{ errors: [{ message: 'invalid query' }] }] } };
  assert.deepEqual(await collect([JSON.stringify([error])]), [{ key: 0, value: error }]);
});
test('actual Google Ads queryStream uses facade without network access', async t => {
  const axios = require('axios');
  const original = axios.defaults.adapter;
  t.after(() => { axios.defaults.adapter = original; });
  axios.defaults.adapter = async config => ({ status: 200, statusText: 'OK', headers: {}, config,
    data: Readable.from(['[{"results":[{"campaign":{"id":"23276824770"},"metrics":{"costMicros":"2500000"}}]}]']) });
  const client = new (require('google-ads-api').GoogleAdsApi)({ client_id: 'test', client_secret: 'test', developer_token: 'test' });
  const customer = client.Customer({ customer_id: '1234567890', refresh_token: 'test' });
  customer.getAccessToken = async () => 'test-only';
  const rows = [];
  for await (const row of customer.queryStream('SELECT campaign.id, metrics.cost_micros FROM campaign')) rows.push(row);
  assert.equal(rows.length, 1);
  // The SDK's existing parserRest converts numeric fields after JSON parsing.
  assert.equal(rows[0].campaign.id, 23276824770);
  assert.equal(rows[0].metrics.cost_micros, 2500000);
});
