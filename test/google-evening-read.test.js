'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {berlinDay,collectEveningRead}=require('../google-evening-read');
test('date uses Berlin including UTC midnight boundary',()=>assert.equal(berlinDay(Date.parse('2026-09-03T22:30:00Z')),'2026-09-04'));
function fixture(){
 const queries=[],events=[];let writes=0;
 const customer={mutateResources:()=>{writes++;throw Error('forbidden');},query:async q=>{queries.push(q);if(q.includes('FROM customer'))return[{customer:{id:'7376153998',currency_code:'EUR',time_zone:'Europe/Berlin'}}];if(q.includes("campaign.status = 'ENABLED'"))return[{campaign:{id:'23276824770',status:'ENABLED'},campaign_budget:{amount_micros:3500000}}];return[];}};
 const collectors={};for(const name of ['Overview','SearchTerms','Keywords','Devices','Hours','AdGroups'])collectors['collectCampaign'+name]=async x=>{assert.equal(x.start,'2026-09-04');assert.equal(x.end,x.start);return[{clicks:2,cost_eur:1,conversions:99,conversion_value:99}];};
 return {customer,collectors,events,queries,writes:()=>writes,opts:{customer,collectors,rsa:async()=>[],now:Date.parse('2026-09-04T17:00:00Z'),emit:e=>events.push(e)}};
}
test('all enabled campaigns read for today without conversion optimization or writes',async()=>{const f=fixture();const r=await collectEveningRead(f.opts);assert.equal(r.status,'complete');assert.equal(f.writes(),0);assert.ok(!JSON.stringify(f.events).includes('conversions'));assert.equal(f.events[0].rows[0].total_budget_micros,3500000);});
test('wrong account fails before campaign queries',async()=>{const f=fixture();f.customer.query=async()=>[{customer:{id:'1'}}];await assert.rejects(collectEveningRead(f.opts),/account_binding/);assert.equal(f.events.length,0);});
test('failed section explicitly partial and no raw provider secret',async()=>{const f=fixture();f.collectors.collectCampaignHours=async()=>{throw Error('secret-sentinel');};const r=await collectEveningRead(f.opts);assert.equal(r.status,'partial');assert.equal(r.errors[0].section,'hours');assert.ok(!JSON.stringify(f.events).includes('secret-sentinel'));});
test('read flags over-cap budget and never silently ignores it',async()=>{const f=fixture();const old=f.customer.query;f.customer.query=async q=>{const rows=await old(q);if(q.includes("campaign.status = 'ENABLED'"))rows[0].campaign_budget.amount_micros=11000000;return rows;};await collectEveningRead(f.opts);assert.equal(f.events[0].rows[0].budget_cage_ok,false);assert.equal(f.writes(),0);});
