'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {berlinDay,readToday,runRuntimePreflight}=require('../google-write-runtime');
test('Berlin day includes UTC midnight offset',()=>assert.equal(berlinDay(new Date('2026-09-03T22:30:00Z')),'2026-09-04'));
test('disabled preflight is observable and does not query',async()=>{
 const logs=[]; const r=await runRuntimePreflight({env:{},log:x=>logs.push(x),customer:{query:()=>assert.fail()}});
 assert.equal(r.status,'disabled'); assert.equal(logs[0].enabled,false);
});
test('missing config is observable without secret values',async()=>{
 const logs=[];await runRuntimePreflight({env:{GOOGLE_ADS_VALIDATE_WRITE_PATH_ON_START:'true',GOOGLE_CLIENT_SECRET:'do-not-log'},log:x=>logs.push(x)});
 assert.equal(logs[1].success,false);assert.ok(!JSON.stringify(logs).includes('do-not-log'));
});
test('today diagnostics never claim hard cap from empty history',async()=>{
 const responses=[[{customer:{id:'1',currency_code:'EUR',time_zone:'Europe/Berlin'}}],[{customer:{id:'1'},metrics:{cost_micros:123}}],[]];
 const r=await readToday({query:async()=>responses.shift()});assert.equal(r.reported_cost_micros,123);assert.equal(r.history_reconciled,false);assert.equal(r.execution_allowed,false);
});
test('missing spend is unknown not zero',async()=>{
 const responses=[[{customer:{id:'1',currency_code:'EUR',time_zone:'Europe/Berlin'}}],[]];
 await assert.rejects(readToday({query:async()=>responses.shift()}),/today_spend_unavailable/);
});
test('truncated history fails closed',async()=>{
 const responses=[[{customer:{id:'1',currency_code:'EUR',time_zone:'Europe/Berlin'}}],[{customer:{id:'1'},metrics:{cost_micros:0}}],Array(10000).fill({})];
 await assert.rejects(readToday({query:async()=>responses.shift()}),/history_truncated/);
});
test('unresponsive provider yields bounded sanitized failure',async()=>{
 const env={GOOGLE_ADS_VALIDATE_WRITE_PATH_ON_START:'true',GOOGLE_CLIENT_ID:'x',GOOGLE_CLIENT_SECRET:'x',GOOGLE_DEVELOPER_TOKEN:'x',GOOGLE_REFRESH_TOKEN:'x',GOOGLE_CUSTOMER_ID:'1'};
 const r=await runRuntimePreflight({env,customer:{query:()=>new Promise(()=>{})},timeoutMs:5,log:()=>{}});
 assert.deepEqual(r.blockers,['preflight_timeout']);assert.equal(r.execution_allowed,false);
});
