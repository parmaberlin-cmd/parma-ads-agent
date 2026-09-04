const test=require('node:test');const assert=require('node:assert/strict');const {validateInventory,validateWritePath}=require('../google-write-path');
const row=(x={})=>({campaign_id:'23276824770',campaign_name:'Search',status:'ENABLED',channel_type:'SEARCH',budget_resource_name:'customers/123/campaignBudgets/456',amount_micros:3500000,explicitly_shared:false,...x});
test('inventory enforces 10 EUR enabled daily cap',()=>{assert.equal(validateInventory([row({amount_micros:10000001})]).ok,false);assert.ok(validateInventory([row({amount_micros:10000001})]).blockers.includes('current_enabled_budget_above_owner_cap'))});
test('shared budgets fail closed',()=>assert.equal(validateInventory([row({explicitly_shared:true})]).ok,false));
test('validate-only mutation proves permission without changing state',async()=>{const rows=[row()];let calls=0;const customer={query:async()=>rows.map(r=>({campaign:{id:r.campaign_id,name:r.campaign_name,status:r.status,advertising_channel_type:r.channel_type,campaign_budget:r.budget_resource_name},campaign_budget:{resource_name:r.budget_resource_name,amount_micros:r.amount_micros,explicitly_shared:r.explicitly_shared}})),mutateResources:async(ops,opts)=>{calls++;assert.equal(opts.validate_only,true);assert.equal(opts.partial_failure,false);assert.equal(ops[0].operation,'update')}};const env={GOOGLE_CLIENT_ID:'x',GOOGLE_CLIENT_SECRET:'x',GOOGLE_DEVELOPER_TOKEN:'x',GOOGLE_REFRESH_TOKEN:'x',GOOGLE_CUSTOMER_ID:'123'};const out=await validateWritePath({env,customer});assert.equal(out.success,true);assert.equal(out.writes_executed,false);assert.equal(out.spend_changed,false);assert.equal(calls,1)});
test('kill switch prevents mutation validation call',async()=>{let calls=0;const customer={query:async()=>[],mutateResources:async()=>{calls++}};const env={GOOGLE_CLIENT_ID:'x',GOOGLE_CLIENT_SECRET:'x',GOOGLE_DEVELOPER_TOKEN:'x',GOOGLE_REFRESH_TOKEN:'x',GOOGLE_CUSTOMER_ID:'123',GOOGLE_ADS_WRITE_KILL_SWITCH:'true'};const out=await validateWritePath({env,customer});assert.equal(out.success,false);assert.equal(calls,0);assert.ok(out.blockers.includes('kill_switch_active'))});
test('missing inventory and malformed rows fail closed',()=>{
  for(const rows of [undefined,null,[],[null],[42]])assert.equal(validateInventory(rows).ok,false);
});
test('unknown status cannot disappear from enabled totals',()=>{
  assert.equal(validateInventory([row({status:'UNKNOWN'})]).ok,false);
});
test('invalid budget ceilings fail closed',()=>{
  for(const maxTotalMicros of [NaN,Infinity,-1,0,'10000000',1.5])
    assert.equal(validateInventory([row()],{maxTotalMicros}).ok,false);
});
test('duplicate campaign and unknown sharing are rejected',()=>{
  assert.equal(validateInventory([row(),row({budget_resource_name:'customers/123/campaignBudgets/789'})]).ok,false);
  assert.equal(validateInventory([row({explicitly_shared:undefined})]).ok,false);
});
test('average budget validation never certifies an actual daily spend cap',()=>{
  const r=validateInventory([row()]);assert.equal(r.ok,true);
  assert.equal(r.hard_daily_spend_cap_verified,false);
});
test('missing configuration returns diagnostics without constructing an API customer',async()=>{
  const r=await validateWritePath({env:{}});
  assert.equal(r.success,false);assert.equal(r.execution_allowed,false);
  assert.ok(r.blockers.includes('google_configuration_incomplete'));
});
