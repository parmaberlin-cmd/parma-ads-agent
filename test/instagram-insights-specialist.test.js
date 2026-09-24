'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {normalizeRows,validateEvidence}=require('../instagram-insights-specialist');

test('normalization marks unsupported metrics unavailable without inventing values',()=>{
 const rows=normalizeRows([{name:'reach',period:'day',values:[{value:12},{value:8}]}],{period:'day',since:'2026-09-18',until:'2026-09-24',source:'Meta Instagram API',retrievedAt:'2026-09-24T20:00:00.000Z'});
 assert.equal(rows.find(x=>x.metric_name==='reach').value,20);
 assert.equal(rows.find(x=>x.metric_name==='reach').availability,'AVAILABLE');
 assert.equal(rows.find(x=>x.metric_name==='views').availability,'UNAVAILABLE');
});

test('validation enforces account, windows and read-only invariants',()=>{
 const evidence={account:{username:'parma.divinibenedetti'},windows:{days_30:{since:'2026-08-26',until:'2026-09-24'},days_7:{since:'2026-09-18',until:'2026-09-24'}},account_metrics:[{metric_name:'reach',value:1,availability:'AVAILABLE'}],content:[],writes_allowed:false,publishing_allowed:false,spend_allowed:false};
 assert.deepEqual(validateEvidence(evidence,{since:'2026-08-26',until:'2026-09-24',focusSince:'2026-09-18',focusUntil:'2026-09-24'}),{ok:true,errors:[]});
 evidence.writes_allowed=true;assert.equal(validateEvidence(evidence,{since:'2026-08-26',until:'2026-09-24',focusSince:'2026-09-18',focusUntil:'2026-09-24'}).ok,false);
});

test('provider-shaped raw data contains no token field by construction',()=>{
 const evidence={account:{username:'parma.divinibenedetti'},windows:{days_30:{since:'2026-08-26',until:'2026-09-24'},days_7:{since:'2026-09-18',until:'2026-09-24'}},account_metrics:[],content:[],raw_provider_data:{account:{id:'1'}},writes_allowed:false,publishing_allowed:false,spend_allowed:false};
 assert.equal(validateEvidence(evidence,{since:'2026-08-26',until:'2026-09-24',focusSince:'2026-09-18',focusUntil:'2026-09-24'}).errors.includes('secret_shaped_field'),false);
});
