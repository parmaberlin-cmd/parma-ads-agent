'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {ControlledProposalJournal}=require('../google-controlled-journal');
const {ExecutionLedger,createControlledExecutor,buildBudgetMutation,createSingleAttemptAdapter}=require('../google-controlled-executor');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'google-execution-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'execution');fs.mkdirSync(dir,{mode:0o700});
 const now=Date.now();const key=randomBytes(32);
 const journal=new ControlledProposalJournal({directory:path.join(root,'proposals'),integrityKey:key,resolveActor:()=> 'owner-policy',now:()=>now});
 const ledger=new ExecutionLedger({directory:dir,integrityKey:key});
 const snapshot={customer_id:'1',currency:'EUR',captured_at:new Date(now).toISOString(),account_inventory_complete:true,campaigns:[{campaign_id:'2',budget_id:'3',daily_budget_micros:2000000,status:'ENABLED',shared_budget:false,conversion_integrity_trusted:false}]};
 const policy={customer_id:'1',campaign_ids:['2'],allowed_actions:['set_daily_budget'],expires_at:new Date(now+60000).toISOString(),max_account_daily_budget_micros:10000000,max_campaign_daily_budget_micros:5000000,max_budget_change_percent:100,max_snapshot_age_seconds:60};
 const p=journal.propose({action:{type:'set_daily_budget',campaign_id:'2',amount_micros:1000000},snapshot,policy});
 journal.decide({proposalId:p.proposal_id,expectedDigest:p.proposal_id,decision:'approved'});
 const calls=[];let current=structuredClone(snapshot),kill=false;
 const safety={customer_id:'1',currency:'EUR',time_zone:'Europe/Berlin',hard_daily_spend_cap_verified:true,today_history_reconciled:true,maximum_billable_today_micros:4000000,reported_cost_micros:100000,checked_at:now,proposal_id:p.proposal_id,audit_storage_durable:true,live_execution_gate:true};
 const customer={customerId:'1',mutateResources:async(ops,options)=>{calls.push(options);if(!options.validate_only)current.campaigns[0].daily_budget_micros=ops[0].resource.amount_micros;}};
 const args={journal,ledger,customer,readSnapshot:async()=>structuredClone(current),readSafety:async()=>safety,readPolicy:async()=>policy,killSwitch:async()=>kill,now:()=>now};
 return {root,dir,p,ledger,journal,safety,args,calls,customer,setKill:x=>kill=x,setCurrent:x=>current=x,snapshot};
}
test('real adapter sends once, verifies, and replay never resends',async t=>{
 const f=fixture(t),e=createControlledExecutor(f.args);const result=await e.execute(f.p.proposal_id);
 assert.equal(result.status,'verified');assert.deepEqual(f.calls,[{validate_only:true,partial_failure:false},{validate_only:false,partial_failure:false}]);
 assert.equal((await e.execute(f.p.proposal_id)).replayed,true);assert.equal(f.calls.length,2);
 assert.equal(f.ledger.read(f.p.proposal_id).rollback.amount_micros,2000000);
});
test('kill switch stops before provider validation',async t=>{const f=fixture(t);f.setKill(true);await assert.rejects(createControlledExecutor(f.args).execute(f.p.proposal_id),/kill_switch/);assert.equal(f.calls.length,0);});
test('hard cap is mandatory even for budget reduction',async t=>{const f=fixture(t);f.safety.hard_daily_spend_cap_verified=false;await assert.rejects(createControlledExecutor(f.args).execute(f.p.proposal_id),/economic_or_runtime/);assert.equal(f.calls.length,0);});
test('10 EUR cannot be exceeded by evidence',async t=>{const f=fixture(t);f.safety.maximum_billable_today_micros=10000001;await assert.rejects(createControlledExecutor(f.args).execute(f.p.proposal_id),/economic_or_runtime/);});
test('uncertain response persists account stop and no retry',async t=>{
 const f=fixture(t);f.customer.mutateResources=async(o,v)=>{f.calls.push(v);if(!v.validate_only)throw Error('network failure');};
 const e=createControlledExecutor(f.args);assert.equal((await e.execute(f.p.proposal_id)).status,'uncertain');
 assert.equal(f.ledger.pending('1'),true);await e.execute(f.p.proposal_id);assert.equal(f.calls.length,2);
});
test('verification mismatch blocks reconciliation without automatic rollback',async t=>{
 const f=fixture(t);f.customer.mutateResources=async(o,v)=>f.calls.push(v);
 assert.equal((await createControlledExecutor(f.args).execute(f.p.proposal_id)).status,'reconciliation_required');assert.equal(f.ledger.pending('1'),true);assert.equal(f.calls.length,2);
});
test('revoked approval fails closed',async t=>{const f=fixture(t);f.journal.decide({proposalId:f.p.proposal_id,expectedDigest:f.p.proposal_id,decision:'cancelled'});await assert.rejects(createControlledExecutor(f.args).execute(f.p.proposal_id),/approved_proposal/);});
test('stale evidence cannot send',async t=>{const f=fixture(t);f.safety.checked_at-=5001;await assert.rejects(createControlledExecutor(f.args).execute(f.p.proposal_id),/economic_or_runtime/);});
test('concurrent account execution locks',async t=>{const f=fixture(t);await f.ledger.exclusive('1',async()=>{await assert.rejects(f.ledger.exclusive('1',async()=>{}),/EEXIST/);});});
test('tampered audit is rejected',async t=>{const f=fixture(t);f.ledger.write(f.p.proposal_id,{id:f.p.proposal_id,status:'sending'});fs.writeFileSync(f.ledger.file(f.p.proposal_id),'{}');assert.throws(()=>f.ledger.read(f.p.proposal_id));});
test('campaign schedule, conversion, and negative writes unsupported',()=>{
 for(const type of ['pause','resume','add_negative_keyword','set_schedule','set_conversion'])assert.throws(()=>buildBudgetMutation({action:{type},before:{},customer_id:'1'}),/not_supported/);
});
test('whole inventory drift rejects even unrelated campaign',async t=>{
 const f=fixture(t);const changed=structuredClone(f.snapshot);changed.campaigns.push({...changed.campaigns[0],campaign_id:'4',budget_id:'5'});f.setCurrent(changed);
 await assert.rejects(createControlledExecutor(f.args).execute(f.p.proposal_id),/snapshot_changed/);
});
test('Google adapter explicitly disables transport retries',async()=>{
 let opts;const adapter=createSingleAttemptAdapter({credentials:{customer_id:'1'},callHeaders:{},buildMutationRequestAndService:()=>({request:{},service:{mutate:async(r,o)=>{opts=o;return [{}];}}})});
 await adapter.mutateResources([],{validate_only:true,partial_failure:false});assert.equal(opts.retry,null);assert.equal(opts.timeout,15000);
});
test('adapter cannot target another customer',async t=>{const f=fixture(t);f.customer.customerId='9';await assert.rejects(createControlledExecutor(f.args).execute(f.p.proposal_id),/customer_mismatch/);});
test('explicit configured-budget mandate does not claim hard cost ceiling',async t=>{
 const f=fixture(t);f.safety.hard_daily_spend_cap_verified=false;f.safety.today_history_reconciled=false;
 f.safety.limit_semantics='enabled_configured_daily_budget';f.safety.today_read_success=true;
 f.safety.reported_cost_micros=11000000;
 const r=await createControlledExecutor({...f.args,limitSemantics:'enabled_configured_daily_budget'}).execute(f.p.proposal_id);
 assert.equal(r.status,'verified');assert.equal(f.ledger.read(f.p.proposal_id).limit_semantics,'enabled_configured_daily_budget');
});
test('configured mode still requires live economic read',async t=>{
 const f=fixture(t);f.safety.limit_semantics='enabled_configured_daily_budget';f.safety.today_read_success=false;
 await assert.rejects(createControlledExecutor({...f.args,limitSemantics:'enabled_configured_daily_budget'}).execute(f.p.proposal_id),/economic_or_runtime/);
});
