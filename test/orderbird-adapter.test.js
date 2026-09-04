'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createOrderbirdAdapter, normalizeSalesSummary } = require('../orderbird-adapter');

test('normalizes aggregated POS sales', () => {
  assert.deepEqual(normalizeSalesSummary({gross_sales:120,net_sales:100,currency:'eur',transactions:6,start:'2026-09-01',end:'2026-09-01'}), {
    source:'orderbird', period:{start:'2026-09-01',end:'2026-09-01'}, gross_sales:{amount:120,currency:'EUR'}, net_sales:{amount:100,currency:'EUR'}, transactions:6, average_ticket:{amount:20,currency:'EUR'}
  });
});

test('adapter is fail-closed against mutations', async () => {
  const calls=[];
  const adapter=createOrderbirdAdapter({baseUrl:'https://official.example/',transport:async (...args)=>{calls.push(args);return {ok:true};}});
  await assert.rejects(adapter.request('/sales',{method:'POST'}),/read_only_violation/);
  assert.equal(calls.length,0);
});

test('adapter only accepts an explicit HTTPS official base URL', () => {
  assert.throws(()=>createOrderbirdAdapter({baseUrl:'http://example.test',transport:async()=>({})}),/official_https_base_url_required/);
});
