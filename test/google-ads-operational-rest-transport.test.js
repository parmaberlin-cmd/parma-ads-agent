'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOperationalRestTransport } = require('../google-ads-operational-rest-transport');
const { compileOperation } = require('../google-ads-operational-control');

const CUSTOMER_ID = '7376153998';
const CAMPAIGN_RESOURCE = `customers/${CUSTOMER_ID}/campaigns/23276824770`;
const AD_GROUP = `customers/${CUSTOMER_ID}/adGroups/195806633999`;

function fixture({ response = { status: 200, data: { results: [] } }, error = null } = {}) {
  const requests = [];
  const customer = {
    credentials: { customer_id: CUSTOMER_ID },
    callHeaders: { 'developer-token': 'hidden', 'login-customer-id': 'hidden' },
    getAccessToken: async () => 'hidden-token',
  };
  const http = {
    request: async request => {
      requests.push(request);
      if (error) throw error;
      return response;
    },
  };
  return { transport: createOperationalRestTransport(customer, { http, timeoutMs: 15000 }), requests, customer };
}

function operationFor(action) {
  return compileOperation(action);
}

test('negative add is sent as a bounded single validate-only REST request with response evidence', async () => {
  const f = fixture({ response: { status: 200, data: { requestId: 'req-1', results: [{}] } } });
  const operation = operationFor({ type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, text: 'glutenfrei', match_type: 'PHRASE' });
  const evidence = await f.transport.mutateResources([operation], { validate_only: true, partial_failure: false });
  assert.equal(f.requests.length, 1);
  const request = f.requests[0];
  assert.equal(request.method, 'POST');
  assert.match(request.url, /^https:\/\/googleads\.googleapis\.com\/v\d+\/customers\/7376153998\/campaignCriteria:mutate$/);
  assert.equal(request.timeout, 15000);
  assert.equal(request.maxRedirects, 0);
  assert.equal(request.headers.Authorization, 'Bearer hidden-token');
  assert.equal(request.headers['developer-token'], 'hidden');
  assert.deepEqual(request.data.operations, [{ create: { campaign: CAMPAIGN_RESOURCE, negative: true, keyword: { text: 'glutenfrei', matchType: 'PHRASE' } } }]);
  assert.equal(request.data.validateOnly, true);
  assert.equal(request.data.partialFailure, false);
  assert.deepEqual(evidence, {
    results: [{}], request_id: 'req-1', http_status: 200, service: 'campaignCriteria',
    entity: 'campaign_criterion', validate_only: true, provider_write: false,
  });
});

test('the write call is distinguishable from the validate-only call', async () => {
  const f = fixture({ response: { status: 200, data: { requestId: 'req-2', results: [{}] } } });
  const operation = operationFor({ type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, text: 'glutenfrei', match_type: 'PHRASE' });
  const validated = await f.transport.mutateResources([operation], { validate_only: true, partial_failure: false });
  const written = await f.transport.mutateResources([operation], { validate_only: false, partial_failure: false });
  assert.equal(validated.provider_write, false);
  assert.equal(validated.validate_only, true);
  assert.equal(written.provider_write, true);
  assert.equal(written.validate_only, false);
  assert.deepEqual(f.requests.map(request => request.data.validateOnly), [true, false]);
});

test('every controlled operation shape maps to a provider REST operation', async () => {
  const f = fixture();
  const cases = [
    [{ type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, text: 'glutenfrei', match_type: 'PHRASE' }, 'campaignCriteria', { create: { campaign: CAMPAIGN_RESOURCE, negative: true, keyword: { text: 'glutenfrei', matchType: 'PHRASE' } } }],
    [{ type: 'schedule_create', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, day_of_week: 'FRIDAY', start_hour: 20, start_minute: 'THIRTY', end_hour: 23, end_minute: 'ZERO' }, 'campaignCriteria', { create: { campaign: CAMPAIGN_RESOURCE, adSchedule: { dayOfWeek: 'FRIDAY', startHour: 20, startMinute: 'THIRTY', endHour: 23, endMinute: 'ZERO' } } }],
    [{ type: 'geo_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, geo_target_constant: 'geoTargetConstants/2276', negative: false }, 'campaignCriteria', { create: { campaign: CAMPAIGN_RESOURCE, negative: false, location: { geoTargetConstant: 'geoTargetConstants/2276' } } }],
    [{ type: 'language_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, language_constant: 'languageConstants/1000' }, 'campaignCriteria', { create: { campaign: CAMPAIGN_RESOURCE, language: { languageConstant: 'languageConstants/1000' } } }],
    [{ type: 'negative_remove', campaign_id: '23276824770', resource_name: `customers/${CUSTOMER_ID}/campaignCriteria/23276824770~1` }, 'campaignCriteria', { remove: `customers/${CUSTOMER_ID}/campaignCriteria/23276824770~1` }],
    [{ type: 'keyword_create', campaign_id: '23276824770', ad_group_resource_name: AD_GROUP, text: 'pizza kreuzberg', match_type: 'EXACT', status: 'PAUSED' }, 'adGroupCriteria', { create: { adGroup: AD_GROUP, status: 'PAUSED', negative: false, keyword: { text: 'pizza kreuzberg', matchType: 'EXACT' } } }],
    [{ type: 'keyword_update', campaign_id: '23276824770', resource_name: `customers/${CUSTOMER_ID}/adGroupCriteria/100~2`, status: 'PAUSED' }, 'adGroupCriteria', { update: { resourceName: `customers/${CUSTOMER_ID}/adGroupCriteria/100~2`, status: 'PAUSED' }, updateMask: 'status' }],
    [{ type: 'keyword_remove', campaign_id: '23276824770', resource_name: `customers/${CUSTOMER_ID}/adGroupCriteria/100~2` }, 'adGroupCriteria', { remove: `customers/${CUSTOMER_ID}/adGroupCriteria/100~2` }],
    [{ type: 'rsa_create', campaign_id: '23276824770', ad_group_resource_name: AD_GROUP, headlines: ['One Headline', 'Two Headline', 'Three Headline'], descriptions: ['One description.', 'Two description.'], final_urls: ['https://www.parmaberlin.de'], status: 'PAUSED' }, 'adGroupAds', { create: { adGroup: AD_GROUP, status: 'PAUSED', ad: { finalUrls: ['https://www.parmaberlin.de'], responsiveSearchAd: { headlines: [{ text: 'One Headline' }, { text: 'Two Headline' }, { text: 'Three Headline' }], descriptions: [{ text: 'One description.' }, { text: 'Two description.' }] } } } }],
    [{ type: 'rsa_update', campaign_id: '23276824770', resource_name: `customers/${CUSTOMER_ID}/adGroupAds/100~3`, status: 'ENABLED' }, 'adGroupAds', { update: { resourceName: `customers/${CUSTOMER_ID}/adGroupAds/100~3`, status: 'ENABLED' }, updateMask: 'status' }],
    [{ type: 'rsa_remove', campaign_id: '23276824770', resource_name: `customers/${CUSTOMER_ID}/adGroupAds/100~3` }, 'adGroupAds', { remove: `customers/${CUSTOMER_ID}/adGroupAds/100~3` }],
    [{ type: 'ad_group_create', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, name: 'Draft', status: 'PAUSED' }, 'adGroups', { create: { campaign: CAMPAIGN_RESOURCE, name: 'Draft', status: 'PAUSED', type: 'SEARCH_STANDARD' } }],
    [{ type: 'ad_group_update', campaign_id: '23276824770', resource_name: AD_GROUP, status: 'PAUSED' }, 'adGroups', { update: { resourceName: AD_GROUP, status: 'PAUSED' }, updateMask: 'status' }],
    [{ type: 'ad_group_remove', campaign_id: '23276824770', resource_name: AD_GROUP }, 'adGroups', { remove: AD_GROUP }],
    [{ type: 'campaign_update', campaign_id: '23276824770', resource_name: CAMPAIGN_RESOURCE, status: 'PAUSED' }, 'campaigns', { update: { resourceName: CAMPAIGN_RESOURCE, status: 'PAUSED' }, updateMask: 'status' }],
    [{ type: 'campaign_remove', campaign_id: '23276824770', resource_name: CAMPAIGN_RESOURCE }, 'campaigns', { remove: CAMPAIGN_RESOURCE }],
    [{ type: 'campaign_budget_create', campaign_id: '0', resource_name: `customers/${CUSTOMER_ID}/campaignBudgets/-1`, name: 'Draft budget', amount_micros: 1000000, explicitly_shared: false }, 'campaignBudgets', { create: { resourceName: `customers/${CUSTOMER_ID}/campaignBudgets/-1`, name: 'Draft budget', amountMicros: '1000000', explicitlyShared: false } }],
    [{ type: 'campaign_budget_remove', campaign_id: '0', resource_name: `customers/${CUSTOMER_ID}/campaignBudgets/-1` }, 'campaignBudgets', { remove: `customers/${CUSTOMER_ID}/campaignBudgets/-1` }],
  ];
  for (const [action, service, expected] of cases) {
    f.requests.length = 0;
    await f.transport.mutateResources([operationFor(action)], { validate_only: true, partial_failure: false });
    assert.equal(f.requests.length, 1);
    assert.match(f.requests[0].url, new RegExp(`/customers/${CUSTOMER_ID}/${service}:mutate$`));
    assert.deepEqual(f.requests[0].data.operations, [expected]);
    assert.equal(f.requests[0].data.validateOnly, true);
  }
});

test('a foreign customer anywhere in the payload is blocked before transport', async () => {
  const f = fixture();
  await assert.rejects(
    () => f.transport.mutateResources([operationFor({ type: 'negative_remove', campaign_id: '23276824770', resource_name: 'customers/9999999999/campaignCriteria/1~2' })], { validate_only: true, partial_failure: false }),
    /operational_cross_customer_transport_blocked/);
  assert.equal(f.requests.length, 0);
});

test('transport contract violations fail closed without any provider call', async () => {
  const f = fixture();
  const operation = operationFor({ type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, text: 'glutenfrei', match_type: 'PHRASE' });
  await assert.rejects(() => f.transport.mutateResources([operation], {}), /validate_only_required/);
  await assert.rejects(() => f.transport.mutateResources([operation], { validate_only: true }), /partial_failure_must_be_false/);
  await assert.rejects(() => f.transport.mutateResources([operation, operation], { validate_only: true, partial_failure: false }), /invalid_operational_rest_batch/);
  await assert.rejects(() => f.transport.mutateResources([{ entity: 'unknown_entity', operation: 'create', resource: {} }], { validate_only: true, partial_failure: false }), /unsupported_operational_entity/);
  assert.equal(f.requests.length, 0);
});

test('invalid transport configuration fails closed', () => {
  assert.throws(() => createOperationalRestTransport({ credentials: { customer_id: 'abc' } }), /invalid_operational_rest_transport/);
  assert.throws(() => createOperationalRestTransport({ credentials: { customer_id: CUSTOMER_ID } }), /invalid_operational_rest_transport/);
  assert.throws(() => createOperationalRestTransport({ credentials: { customer_id: CUSTOMER_ID }, getAccessToken: async () => '' }, { timeoutMs: 10 }), /invalid_operational_rest_timeout/);
  assert.throws(() => createOperationalRestTransport({ credentials: { customer_id: CUSTOMER_ID }, getAccessToken: async () => '' }, { timeoutMs: 99000 }), /invalid_operational_rest_timeout/);
});

test('provider rejections and transport ambiguity are distinguished and never retried', async () => {
  const operation = operationFor({ type: 'negative_add', campaign_id: '23276824770', campaign_resource_name: CAMPAIGN_RESOURCE, text: 'glutenfrei', match_type: 'PHRASE' });

  const rejected = fixture({ response: { status: 400, data: { error: { code: 400, message: 'Request contains an invalid argument.' } } } });
  await assert.rejects(() => rejected.transport.mutateResources([operation], { validate_only: true, partial_failure: false }), /provider_mutation_rejected:400/);
  assert.equal(rejected.requests.length, 1);

  const serverError = fixture({ response: { status: 503, data: { error: { code: 503 } } } });
  await assert.rejects(() => serverError.transport.mutateResources([operation], { validate_only: false, partial_failure: false }), /provider_transport_ambiguous:503/);
  assert.equal(serverError.requests.length, 1);

  const timeout = fixture({ error: Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' }) });
  await assert.rejects(() => timeout.transport.mutateResources([operation], { validate_only: false, partial_failure: false }), /provider_transport_timeout/);
  assert.equal(timeout.requests.length, 1);

  const network = fixture({ error: new Error('socket hang up') });
  await assert.rejects(() => network.transport.mutateResources([operation], { validate_only: false, partial_failure: false }), /provider_transport_ambiguous/);
  assert.equal(network.requests.length, 1);
});
