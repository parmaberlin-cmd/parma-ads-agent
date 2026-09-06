const test = require('node:test');
const assert = require('node:assert/strict');
const { installGoogleCampaignIntelligenceRoute } = require('../google-campaign-intelligence-route');
const { getGoogleDateRange, parseGoogleReadMode } = require('../google-time-utils');

function routeFixture(overrides = {}) {
  let handler = null;
  const app = { get(path, ...args) { if (path === '/tools/google/campaign/:id/intelligence') handler = args[1]; } };
  installGoogleCampaignIntelligenceRoute({
    app,
    requireApiKey: (req, res, next) => next(),
    checkGoogleConfig: () => true,
    parseGoogleCampaignId: value => (/^\d{1,20}$/.test(String(value || '')) ? String(value) : null),
    parseGoogleDays: value => {
      const days = Number(value ?? 30);
      return Number.isInteger(days) && days >= 0 && days <= 90 ? days : null;
    },
    parseGoogleReadMode,
    getGoogleDateRange,
    googleTimezone: () => 'Europe/Berlin',
    cleanGoogleError: error => ({ message: String(error?.message || 'failed') }),
    ...overrides,
  });
  return handler;
}

function responseCapture() {
  const output = { status: 200, body: null };
  return {
    output,
    status(code) { output.status = code; return this; },
    json(payload) { output.body = payload; return this; },
  };
}

test('today_intraday mode reports explicit intraday partial/empty notice', async () => {
  const queries = [];
  const handler = routeFixture({
    getGoogleCustomer: () => ({ query: async (query) => { queries.push(query); return []; } }),
  });
  const res = responseCapture();
  await handler({ params: { id: '23276824770' }, query: { read_mode: 'today_intraday', days: '1' } }, res);
  assert.equal(res.output.status, 200);
  assert.equal(res.output.body.read_mode, 'today_intraday');
  assert.equal(res.output.body.date_range.intraday, true);
  assert.equal(res.output.body.inferred_diagnosis.intraday_reporting_notice.mode, 'intraday_partial_possible');
  assert.match(res.output.body.inferred_diagnosis.intraday_reporting_notice.note, /No intraday delivery is currently visible/);
  for (const query of queries) assert.match(query, /^\s*SELECT/i);
});

test('today_intraday mode marks partial-data risk even when some intraday rows exist', async () => {
  const handler = routeFixture({
    getGoogleCustomer: () => ({
      query: async (query) => {
        if (query.includes('FROM campaign') && query.includes('segments.date')) {
          return [{ campaign: { id: '23276824770' }, campaign_budget: { amount_micros: 2500000 }, metrics: { impressions: 2, clicks: 1, cost_micros: 1000000 } }];
        }
        if (query.includes('FROM campaign') && query.includes('campaign.serving_status')) {
          return [{ campaign: { id: '23276824770', status: 'ENABLED', primary_status: 'ELIGIBLE', campaign_budget: 'customers/x/campaignBudgets/1' }, campaign_budget: { id: '1', amount_micros: 2500000 } }];
        }
        return [];
      },
    }),
  });
  const res = responseCapture();
  await handler({ params: { id: '23276824770' }, query: { read_mode: 'today_intraday', days: '1' } }, res);
  assert.equal(res.output.status, 200);
  assert.equal(res.output.body.inferred_diagnosis.intraday_reporting_notice.mode, 'intraday_partial_possible');
  assert.match(res.output.body.inferred_diagnosis.intraday_reporting_notice.note, /can be delayed or partial/);
});

test('invalid read_mode is rejected', async () => {
  const handler = routeFixture({ getGoogleCustomer: () => ({ query: async () => [] }) });
  const res = responseCapture();
  await handler({ params: { id: '23276824770' }, query: { read_mode: 'future', days: '1' } }, res);
  assert.equal(res.output.status, 400);
});
