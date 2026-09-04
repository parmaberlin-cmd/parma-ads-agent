'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createOrderbirdAdapter } = require('../orderbird-adapter');
const { normalizeOrderbirdAggregate, containsDisallowedPii } = require('../orderbird-normalize');
const { createOrderbirdIngestion, createMemoryAggregateStore } = require('../orderbird-ingestion');

test('adapter fails closed without provider-supported transport', async () => {
  const adapter = createOrderbirdAdapter();
  assert.equal(adapter.health().usable, false);
  await assert.rejects(() => adapter.readAggregates({startDate:'2026-09-01',endDate:'2026-09-01'}), /provider_supported_orderbird_transport_not_configured/);
  await assert.rejects(() => adapter.mutate(), /orderbird_mutations_forbidden/);
});

test('normalization preserves POS ground truth and never invents attribution', () => {
  const row = normalizeOrderbirdAggregate({
    businessDate:'2026-09-01', gross:119, net:100, tax:19,
    paymentMethods:[{name:'Bar',amount:49},{name:'Visa',amount:70}],
    categories:[{name:'Pizza',gross:90,net:75.63,tax:14.37,quantity:8}],
    hourly:[{hour:'22',gross:35,net:29.41,tax:5.59}]
  });
  assert.equal(row.source_kind, 'pos_ground_truth');
  assert.equal(row.attribution_kind, 'none');
  assert.equal(row.payment_methods[0].method, 'cash');
  assert.equal(row.payment_methods[1].method, 'card');
  assert.equal(row.hourly[0].hour, '22');
});

test('PII markers are rejected before persistence', async () => {
  const adapter = createOrderbirdAdapter({transport:{providerSupported:true, async fetchAggregates(){ return [{businessDate:'2026-09-01',gross:10,customer_email:'x@example.com'}]; }}});
  const store = createMemoryAggregateStore();
  const ingestion = createOrderbirdIngestion({adapter,store});
  const result = await ingestion.ingestCompletedDay('2026-09-01');
  assert.equal(result.rejected,1);
  assert.equal((await store.list()).length,0);
  assert.equal(containsDisallowedPii({customer_email:'x'}),true);
});

test('7-day backfill is idempotent by source and business date', async () => {
  const adapter = createOrderbirdAdapter({transport:{providerSupported:true, async fetchAggregates({startDate,endDate}){
    return [{businessDate:startDate,gross:10,net:9,tax:1},{businessDate:endDate,gross:20,net:18,tax:2}];
  }}});
  const store = createMemoryAggregateStore();
  const ingestion = createOrderbirdIngestion({adapter,store});
  await ingestion.backfill7Days('2026-09-07');
  await ingestion.backfill7Days('2026-09-07');
  const rows = await store.list();
  assert.equal(rows.length,2);
  assert.ok(rows.some(x => x.business_date === '2026-09-01'));
  assert.ok(rows.some(x => x.business_date === '2026-09-07'));
});
