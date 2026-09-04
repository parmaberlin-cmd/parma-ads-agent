'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {collectConfiguredInventory:collect,INVENTORY_QUERY}=require('../google-controlled-inventory-reader');
const env={GOOGLE_CLIENT_ID:'private',GOOGLE_CLIENT_SECRET:'private',GOOGLE_DEVELOPER_TOKEN:'private',GOOGLE_REFRESH_TOKEN:'private',GOOGLE_CUSTOMER_ID:'123'};
const row=(id=1)=>({campaign:{id,resource_name:`customers/123/campaigns/${id}`,status:2,campaign_budget:`customers/123/campaignBudgets/${id}`},
  campaign_budget:{id,resource_name:`customers/123/campaignBudgets/${id}`,amount_micros:'3500000',explicitly_shared:false,period:2}});
function factory(rows, calls=[], account={id:123,currency_code:'EUR',time_zone:'Europe/Berlin'}) {
  return ()=>({async *queryStream(query){calls.push(query); if(query.includes('FROM customer')) yield {customer:account};
    else for(const r of rows) yield r;
  }});
}
test('configured SDK reader completes two full scans and normalizes daily budgets',async()=>{
  const calls=[],rows=[row(),row(2)]; rows[1].campaign.status='PAUSED';
  const r=await collect({env,createCustomer:factory(rows,calls)});
  assert.equal(r.success,true);assert.equal(calls.length,4);
  assert.equal(r.snapshot.campaigns[1].status,'PAUSED');
  assert.equal(r.snapshot.campaigns[0].daily_budget_micros,3500000);
  assert.equal(r.execution_allowed,false);
  assert.ok(!/metrics\.|segments\.|LIMIT|campaign.id\s*=/.test(INVENTORY_QUERY));
});
test('streams over one normalized page without losing rows',async()=>{
  const r=await collect({env,createCustomer:factory(Array.from({length:1001},(_,i)=>row(i+1)))});
  assert.equal(r.success,true);assert.equal(r.snapshot.campaigns.length,1001);
});
for(const [name,change] of [
  ['foreign resource',r=>r.campaign.resource_name='customers/456/campaigns/1'],
  ['budget link mismatch',r=>r.campaign.campaign_budget='customers/123/campaignBudgets/9'],
  ['lifetime budget',r=>r.campaign_budget.period='CUSTOM_PERIOD'],
  ['missing sharing flag',r=>delete r.campaign_budget.explicitly_shared],
  ['unsafe id',r=>r.campaign.id=Number.MAX_SAFE_INTEGER+1],
  ['unsafe amount',r=>r.campaign_budget.amount_micros='9007199254740993'],
  ['removed row',r=>r.campaign.status=4],
]) test(`blocks ${name}`,async()=>{
  const data=row();change(data);const r=await collect({env,createCustomer:factory([data])});
  assert.equal(r.success,false);assert.equal(r.snapshot,null);assert.equal(r.execution_allowed,false);
});
test('wrong account metadata fails closed',async()=>{
  const r=await collect({env,createCustomer:factory([row()],[],{id:456,currency_code:'EUR',time_zone:'UTC'})});
  assert.equal(r.success,false);
});
test('stream errors discard all partial data and redact provider errors',async()=>{
  const r=await collect({env,createCustomer:()=>({async *queryStream(q){
    if(q.includes('FROM customer')) yield {customer:{id:123,currency_code:'EUR',time_zone:'UTC'}};
    else {yield row();throw new Error('PRIVATE_TOKEN');}
  }})});
  assert.equal(r.snapshot,null);assert.ok(!JSON.stringify(r).includes('PRIVATE_TOKEN'));
});
test('invalid configuration does not initialize SDK or leak values',async()=>{
  for(const config of [{},{...env,GOOGLE_CUSTOMER_ID:'abc123'},{...env,GOOGLE_LOGIN_CUSTOMER_ID:'bad'}]) {
    let called=false;const r=await collect({env:config,createCustomer:()=>{called=true;throw new Error('private');}});
    assert.equal(called,false);assert.equal(r.success,false);assert.ok(!JSON.stringify(r).includes('private'));
  }
});
test('formatted account ID is normalized before creating SDK customer',async()=>{
  let actual;
  const r=await collect({env:{...env,GOOGLE_CUSTOMER_ID:'123-456-7890'},createCustomer:(_,opts)=>{
    actual=opts.customer_id;return factory([],[],{id:'1234567890',currency_code:'EUR',time_zone:'UTC'})();
  }});
  assert.equal(actual,'1234567890');assert.equal(r.success,false); // Empty accounts cannot back proposals.
});
test('diagnostic CLI fails safely without configured credentials',()=>{
  const {spawnSync}=require('node:child_process'),path=require('node:path');
  const r=spawnSync(process.execPath,[path.join(__dirname,'../scripts/run-google-controlled-inventory.js')],{env:{},encoding:'utf8'});
  assert.equal(r.status,1);assert.equal(r.stderr,'');
  const output=JSON.parse(r.stdout);assert.equal(output.success,false);
  assert.equal(output.execution_allowed,false);assert.equal(output.campaign_count,0);
  assert.ok(!('snapshot' in output));assert.ok(!('customer_id' in output));
});
test('reader refuses a stream beyond the documented account size limit',async()=>{
  const r=await collect({env,createCustomer:factory(Array.from({length:10001},(_,i)=>row(i+1)))});
  assert.equal(r.success,false);assert.equal(r.snapshot,null);
});
