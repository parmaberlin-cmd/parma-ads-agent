'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ControlledProposalJournal:Journal}=require('../google-controlled-journal');
const key=Buffer.alloc(32,7),start=Date.parse('2026-09-04T10:00:00Z');
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'parma-journal-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let now=start,who='owner:123';
  const config={directory,integrityKey:key,resolveActor:()=>who,now:()=>now};
  const store=new Journal(config);
  const input={action:{type:'pause',campaign_id:'1'},
    policy:{customer_id:'123',campaign_ids:['1'],allowed_actions:['pause'],expires_at:'2026-09-04T11:00:00Z',
      max_account_daily_budget_micros:5000000,max_campaign_daily_budget_micros:5000000,max_budget_change_percent:10,max_snapshot_age_seconds:300},
    snapshot:{customer_id:'123',currency:'EUR',captured_at:'2026-09-04T10:00:00Z',account_inventory_complete:true,
      campaigns:[{campaign_id:'1',budget_id:'10',daily_budget_micros:3500000,status:'ENABLED',shared_budget:false,conversion_integrity_trusted:false}]}};
  return {directory,store,input,config,setTime:v=>now=v,setActor:v=>who=v};
}
function decide(store,r,decision='approved'){return store.decide({proposalId:r.proposal_id,expectedDigest:r.proposal_id,decision});}
test('persists exact proposal, identity and approval; never grants execution',t=>{
  const f=fixture(t),r=f.store.propose(f.input),copy=structuredClone(r.proposal);
  assert.equal(r.proposal.customer_id,'123');assert.equal(r.history[0].actor_id,'owner:123');
  const approved=decide(f.store,r);
  assert.equal(approved.status,'approved');assert.equal(approved.history.length,2);
  assert.equal(approved.execution_allowed,false);assert.equal(approved.spend_allowed,false);
  const restarted=new Journal(f.config),loaded=restarted.get(r.proposal_id);
  assert.deepEqual(loaded.proposal,copy);assert.equal(loaded.approval_current,true);
  loaded.proposal.customer_id='456';assert.equal(restarted.get(r.proposal_id).proposal.customer_id,'123');
});
test('duplicate insertion is rejected without changing the journal',t=>{
  const f=fixture(t);f.store.propose(f.input);const before=fs.readFileSync(f.store.file);
  assert.throws(()=>f.store.propose(f.input),/duplicate/);assert.deepEqual(fs.readFileSync(f.store.file),before);
});
test('rejects digest mismatch and unsupported decisions',t=>{
  const f=fixture(t),r=f.store.propose(f.input);
  for(const value of [{expectedDigest:'a'.repeat(64),decision:'approved'},{expectedDigest:r.proposal_id,decision:'execute'}])
    assert.throws(()=>f.store.decide({proposalId:r.proposal_id,...value}),/decision_invalid/);
  assert.equal(f.store.get(r.proposal_id).status,'proposed');
});
test('rejected and cancelled records cannot be approved later',t=>{
  const f=fixture(t);for(const state of ['rejected','cancelled']){
    const r=f.store.propose(f.input);decide(f.store,r,state);
    assert.throws(()=>decide(f.store,r),/transition_blocked/);
    f.setTime(start+1);
  }
});
test('an approved proposal can be cancelled but cannot be approved twice',t=>{
  const f=fixture(t),r=f.store.propose(f.input);decide(f.store,r);
  assert.throws(()=>decide(f.store,r),/transition_blocked/);
  const cancelled=decide(f.store,r,'cancelled');assert.equal(cancelled.history.length,3);
  assert.equal(f.store.get(r.proposal_id).approval_current,false);
});
test('expiry is applied at the exact boundary; server clock cannot be supplied in input',t=>{
  const f=fixture(t),r=f.store.propose({...f.input,now:0});
  assert.equal(r.proposal.created_at,'2026-09-04T10:00:00.000Z');
  f.setTime(start+300000);assert.equal(decide(f.store,r).status,'expired');
  assert.equal(f.store.get(r.proposal_id).approval_current,false);
});
test('cached approval becomes invalid after time passes without a new mutation',t=>{
  const f=fixture(t),r=f.store.propose(f.input);decide(f.store,r);
  f.setTime(start+300000);assert.equal(f.store.get(r.proposal_id).approval_current,false);
});
test('clock reversal is rejected',t=>{
  const f=fixture(t),r=f.store.propose(f.input);f.setTime(start-1);
  assert.throws(()=>decide(f.store,r),/clock_reversed/);
});
test('actor comes from trusted callback, never from caller fields',t=>{
  const f=fixture(t),r=f.store.propose({...f.input,actor_id:'attacker'});
  assert.equal(r.history[0].actor_id,'owner:123');
  f.setActor(null);assert.throws(()=>decide(f.store,r),/actor_required/);
  assert.throws(()=>f.store.get(r.proposal_id),/actor_required/);
});
test('unauthorized or incomplete proposals cannot enter the journal',t=>{
  const f=fixture(t);delete f.input.policy;assert.throws(()=>f.store.propose(f.input),/proposal_blocked/);
  assert.equal(fs.existsSync(f.store.file),false);
});
test('independent instances reload under lock and preserve previous records',t=>{
  const f=fixture(t),other=new Journal(f.config),first=f.store.propose(f.input);
  f.setTime(start+1);const second=other.propose(f.input);
  assert.ok(other.get(first.proposal_id));assert.ok(f.store.get(second.proposal_id));
});
test('existing lock blocks writes and is never removed by a competing writer',t=>{
  const f=fixture(t),lock=path.join(f.directory,'proposals.lock');fs.writeFileSync(lock,'');
  assert.throws(()=>f.store.propose(f.input),/journal_locked/);assert.equal(fs.existsSync(lock),true);
});
test('tampered content is preserved and cannot be silently replaced',t=>{
  const f=fixture(t);f.store.propose(f.input);const envelope=JSON.parse(fs.readFileSync(f.store.file));
  envelope.payload=envelope.payload.replace('proposed','approved');fs.writeFileSync(f.store.file,JSON.stringify(envelope));
  const before=fs.readFileSync(f.store.file);assert.throws(()=>new Journal(f.config),/integrity_failed/);
  assert.deepEqual(fs.readFileSync(f.store.file),before);
});
test('malformed JSON and wrong key are rejected',t=>{
  const f=fixture(t);f.store.propose(f.input);
  assert.throws(()=>new Journal({...f.config,integrityKey:Buffer.alloc(32,8)}),/integrity_failed/);
  fs.writeFileSync(f.store.file,'broken');assert.throws(()=>new Journal(f.config),/journal_corrupt/);
});
test('directory and journal use private permissions',t=>{
  const f=fixture(t);f.store.propose(f.input);
  assert.equal(fs.statSync(f.directory).mode&0o777,0o700);assert.equal(fs.statSync(f.store.file).mode&0o777,0o600);
  assert.equal(fs.existsSync(path.join(f.directory,'proposals.lock')),false);
  assert.equal(fs.readdirSync(f.directory).filter(x=>x.endsWith('.tmp')).length,0);
});
test('symlink journal is rejected',t=>{
  const f=fixture(t),target=path.join(f.directory,'target');fs.writeFileSync(target,'{}');fs.symlinkSync(target,f.store.file);
  assert.throws(()=>new Journal(f.config),/file_invalid/);
});
test('disappearing journal does not reset an active instance',t=>{
  const f=fixture(t),r=f.store.propose(f.input);fs.unlinkSync(f.store.file);
  assert.throws(()=>f.store.get(r.proposal_id),/disappeared/);
});
test('malformed kill switch cannot be converted into permission',t=>{
  const f=fixture(t);
  for(const value of [null,true,'false',0])assert.throws(()=>f.store.propose({...f.input,kill_switch:value}),/proposal_blocked/);
});
test('dangling symlink cannot masquerade as a new journal',t=>{
  const f=fixture(t);fs.symlinkSync(path.join(f.directory,'missing'),f.store.file);
  assert.throws(()=>new Journal(f.config),/file_invalid/);
  assert.equal(fs.lstatSync(f.store.file).isSymbolicLink(),true);
});
