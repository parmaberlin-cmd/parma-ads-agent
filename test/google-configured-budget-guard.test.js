'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {configuredBudgetGuard}=require('../google-configured-budget-guard');
const snapshot=()=>({currency:'EUR',account_inventory_complete:true,campaigns:[{campaign_id:'1',budget_id:'2',status:'ENABLED',daily_budget_micros:3500000,shared_budget:false},{campaign_id:'3',budget_id:'4',status:'ENABLED',daily_budget_micros:4000000,shared_budget:false}]});
test('10 EUR enabled configured total passes without promising cost cap',()=>{const r=configuredBudgetGuard(snapshot(),{type:'set_daily_budget',campaign_id:'1',amount_micros:6000000});assert.equal(r.after_micros,10000000);assert.equal(r.hard_daily_cost_cap,false);});
test('one micro above total rejects',()=>assert.throws(()=>configuredBudgetGuard(snapshot(),{type:'set_daily_budget',campaign_id:'1',amount_micros:6000001}),/cap_exceeded/));
test('paused budget excluded but shared budget still fails',()=>{const s=snapshot();s.campaigns[1].status='PAUSED';assert.equal(configuredBudgetGuard(s,{type:'set_daily_budget',campaign_id:'1',amount_micros:6000000}).after_micros,6000000);s.campaigns[1].shared_budget=true;assert.throws(()=>configuredBudgetGuard(s,{type:'set_daily_budget',campaign_id:'1',amount_micros:6000000}));});
test('unknown status never silently disappears',()=>{const s=snapshot();s.campaigns[0].status='UNKNOWN';assert.throws(()=>configuredBudgetGuard(s,{type:'set_daily_budget',campaign_id:'1',amount_micros:1000000}));});
