'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createOrderbirdAdapter } = require('../orderbird-adapter');
const { normalizeOrderbirdAggregate, containsDisallowedPii } = require('../orderbird-normalize');
const { createJsonAggregateStore } = require('../orderbird-store');
const { createOrderbirdIngestion } = require('../orderbird-ingestion');

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'orderbird-test-'));
  return createJsonAggregateStore({filePath:path.join(dir,'rows.json')});
}

test('adapter fails closed and mutations are forbidden', async () => {
  const adapter = createOrderbirdAdapter();
  assert.equal(adapter.health().usable,false);
  await assert.rejects(()=>adapter.readAggregates({startDate:'2026-09-01',endDate:'2026-09-01'}),/provider_supported_orderbird_transport_not_configured/);
  await assert.rejects(()=>adapter.mutate(),/orderbird_mutations_forbidden/);
});

test('normalizer preserves revenue ground truth and no marketing attribution', () => {
  const row = normalizeOrderbirdAggregate({businessDate:'2026-09-01',gross:119,net:100,tax:19,paymentMethods:[{name:'Bar',amount:49},{name:'Visa',amount:70}],categories:[{name:'Pizza',gross:90,quantity:8}],articles:[{name:'Margherita',gross:45,quantity:5}],tables:[{name:'T1',gross:30}],shifts:[{name:'Dinner',gross:119}],hourly:[{hour:'22',gross:35,net:29.41,tax:5.59}]});
  assert.equal(row.source_kind,'pos_revenue_ground_truth');
  assert.equal(row.attribution_kind,'none');
  assert.equal(row.payment_methods[0].method,'cash');
  assert.equal(row.payment_methods[1].method,'card');
  assert.equal(row.shifts[0].name,'Dinner');
});

test('PII markers are rejected before persistence', async () => {
  const adapter = createOrderbirdAdapter({transport:{providerSupported:true,async fetchAggregates(){return [{businessDate:'2026-09-01',gross:10,customer_email:'x@example.com'}];}}});
  const store = tempStore();
  const ingestion = createOrderbirdIngestion({adapter,store});
  const result = await ingestion.ingestCompletedDay('2026-09-01');
  assert.equal(result.rejected,1);
  assert.equal((await store.list()).length,0);
  assert.equal(containsDisallowedPii({receipt_id:'x'}),true);
});

test('durable store and backfill are idempotent by source and business date', async () => {
  const store = tempStore();
  const adapter = createOrderbirdAdapter({transport:{providerSupported:true,async fetchAggregates({startDate,endDate}){return [{businessDate:startDate,gross:10,net:9,tax:1},{businessDate:endDate,gross:20,net:18,tax:2}];}}});
  const ingestion = createOrderbirdIngestion({adapter,store,now:()=>new Date('2026-09-08T04:00:00Z')});
  await ingestion.backfill7Days('2026-09-07');
  await ingestion.backfill7Days('2026-09-07');
  const rows = await store.list();
  assert.equal(rows.length,2);
  assert.ok(rows.some(x=>x.business_date==='2026-09-01'));
  assert.ok(rows.some(x=>x.business_date==='2026-09-07'));
  assert.equal(ingestion.health().last_run.status,'success');
  assert.equal(ingestion.health().source_kind,'pos_revenue_ground_truth');
  assert.equal(ingestion.health().attribution_kind,'none');
});

test('provider transport error becomes health state without leaking credentials', async () => {
  const err = Object.assign(new Error('provider_down'),{code:'ORDERBIRD_PROVIDER_DOWN'});
  const adapter = createOrderbirdAdapter({transport:{providerSupported:true,async fetchAggregates(){throw err;}}});
  const ingestion = createOrderbirdIngestion({adapter,store:tempStore(),now:()=>new Date('2026-09-08T04:00:00Z')});
  await assert.rejects(()=>ingestion.ingestCompletedDay('2026-09-07'),/provider_down/);
  const health = ingestion.health();
  assert.equal(health.healthy,false);
  assert.equal(health.last_run.error,'ORDERBIRD_PROVIDER_DOWN');
  assert.equal(JSON.stringify(health).includes('token'),false);
});
