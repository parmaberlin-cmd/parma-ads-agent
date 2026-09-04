'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { proposeChanges, validateProposal }=require('../google-ads-specialist-propose');
const { authorizeAutonomy }=require('../autonomy-policy');

function evidence(overrides={}){
  return {
    schema:'google_ads.read_campaign.v1',source:'google_ads',mode:'read_only',campaign_id:'23276824770',date_range:{start:'2026-08-05',end:'2026-09-03',days:30},
    overview:{status:'ENABLED',daily_budget_eur:3.5,impressions:16718,clicks:512,cost_eur:104.3,ctr:0.0306,avg_cpc_eur:0.2037,conversions:22,conversion_value:22},
    search_terms:[
      {search_term:'pizza in meiner nähe',impressions:20,clicks:3,cost_eur:1},
      {search_term:'60 seconds to napoli',impressions:12,clicks:1,cost_eur:0.5},
      {search_term:'dominos pizza',impressions:9,clicks:1,cost_eur:0.3},
    ],
    keyword_summary:[{keyword:'beste pizza berlin',match_type:'BROAD',impressions:7572,clicks:228,cost_eur:47.14}],
    hourly_distribution:[{day_of_week:'FRIDAY',hour:22,impressions:100,clicks:4,cost_eur:1}],
    device_distribution:[{device:'MOBILE',impressions:900},{device:'DESKTOP',impressions:100}],
    geographic_distribution:[{location_type:'LOCATION_OF_PRESENCE',impressions:1000,clicks:30,cost_eur:8}],
    account_budget_context:{enabled_budget_total_eur:3.5,enabled_budget_count:1,enabled_budgets:[{budget_id:'1',daily_budget_eur:3.5,campaign_ids:['23276824770']}],shared_budgets_deduplicated:true},
    conversion_metrics:{raw_reported_values:true,actions:[{conversion_action_name:'booking_completed',conversions:22}]},writes_allowed:false,execution_allowed:false,spend_allowed:false,
    ...overrides,
  };
}

const context={daily_budget_cap_eur:10,goal:'maximize_probability_of_real_local_customers',late_night_strategy:true,weather_context:'rain/wind earlier; improving later; context signal only'};

test('proposal is deterministic, valid, within budget cage and uses no conversions',()=>{
  const a=proposeChanges({readEvidence:evidence(),context});
  const b=proposeChanges({readEvidence:evidence(),context});
  assert.equal(a.validated,true);
  assert.equal(validateProposal(a.evidence),true);
  assert.deepEqual(a.evidence,b.evidence);
  assert.ok(a.evidence.budget_cage.proposed_total_eur<=10);
  assert.equal(a.evidence.budget_cage.hard_daily_cost_cap,false);
  assert.equal(a.evidence.mutations_executed,0);
  assert.ok(a.evidence.actions.every(x=>x.conversion_signal_used==='NONE'));
  assert.ok(a.evidence.actions.every(x=>!(x.status==='AUTO_EXECUTABLE'&&['spend_change','campaign_creation','activation','ad_platform_write'].includes(x.delegation_class))));
});

test('near-me intent is protected and competitor negatives require search-term evidence',()=>{
  const p=proposeChanges({readEvidence:evidence(),context}).evidence;
  assert.equal(p.actions.some(a=>a.action_type==='negative_keyword_addition'&&/in meiner nähe/i.test(String(a.target))),false);
  const negatives=p.actions.filter(a=>a.action_type==='negative_keyword_addition');
  assert.ok(negatives.length>=1);
  assert.ok(negatives.every(a=>a.evidence_refs.some(r=>r.startsWith('read_campaign.search_terms['))));
});

test('budget action is NEEDS_HUMAN and proposal capability itself is safe read-only',()=>{
  const p=proposeChanges({readEvidence:evidence(),context}).evidence;
  const budget=p.actions.find(a=>a.action_type==='budget_adjustment');
  assert.equal(budget.status,'NEEDS_HUMAN');
  assert.equal(budget.delegation_class,'spend_change');
  const gate=authorizeAutonomy({name:'google_ads.propose_changes'},{});
  assert.equal(gate.allowed,true);
  assert.equal(gate.reason,'safe_read_only_action');
});

test('existing budget over cage produces reduction proposal and valid proposed total',()=>{
  const e=evidence({overview:{status:'ENABLED',daily_budget_eur:6,impressions:100,clicks:10,cost_eur:5,ctr:0.1,avg_cpc_eur:0.5,conversions:1,conversion_value:1},account_budget_context:{enabled_budget_total_eur:12,enabled_budget_count:2,enabled_budgets:[{budget_id:'1',daily_budget_eur:6,campaign_ids:['23276824770']},{budget_id:'2',daily_budget_eur:6,campaign_ids:['999']}],shared_budgets_deduplicated:true}});
  const p=proposeChanges({readEvidence:e,context}).evidence;
  assert.equal(p.budget_cage.proposed_total_eur,10);
  const budget=p.actions.find(a=>a.action_type==='budget_adjustment');
  assert.equal(budget.proposed_value.daily_budget_eur,4);
  assert.equal(budget.status,'NEEDS_HUMAN');
});

test('missing aggregate budget context fails closed',()=>{
  const e=evidence(); delete e.account_budget_context;
  assert.throws(()=>proposeChanges({readEvidence:e,context}),/enabled_campaign_budget_context_required/);
});
