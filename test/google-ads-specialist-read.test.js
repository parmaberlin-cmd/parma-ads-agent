'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {safeRange,validateEvidence}=require('../google-ads-specialist-read');
const {authorizeAutonomy}=require('../autonomy-policy');
const {taskDateRange}=require('../autonomous-runtime-service');

test('google_ads.read_campaign is explicitly safe read-only',()=>{
  const r=authorizeAutonomy({name:'google_ads.read_campaign'},{kill_switch:false,human_approved:false});
  assert.equal(r.allowed,true); assert.equal(r.action_class,'read_only'); assert.equal(r.reason,'safe_read_only_action');
});

test('date range is bounded to 90 days',()=>{
  assert.deepEqual(safeRange({start:'2026-08-02',end:'2026-08-31'}),{start:'2026-08-02',end:'2026-08-31',days:30});
  assert.throws(()=>safeRange({start:'2026-01-01',end:'2026-08-31'}),/date_range_out_of_bounds/);
});

test('runtime read handler accepts objective start_date/end_date aliases', async()=>{
  assert.deepEqual(taskDateRange({start_date:'2026-09-05',end_date:'2026-09-05'}),{start:'2026-09-05',end:'2026-09-05'});
  assert.deepEqual(taskDateRange({start:'2026-09-04',end:'2026-09-04',start_date:'ignored',end_date:'ignored'}),{start:'2026-09-04',end:'2026-09-04'});
});

test('deterministic evidence validates and rejects secret-shaped output',()=>{
  const base={campaign_id:'23276824770',overview:{daily_budget_eur:3.5,impressions:100,clicks:10,cost_eur:5,ctr:0.1,avg_cpc_eur:0.5,conversions:2,conversion_value:0}};
  assert.equal(validateEvidence(base,'23276824770'),true);
  assert.equal(validateEvidence({...base,authorization:'Bearer abc'},'23276824770'),false);
  assert.equal(validateEvidence({...base,overview:{...base.overview,clicks:101}},'23276824770'),false);
});
