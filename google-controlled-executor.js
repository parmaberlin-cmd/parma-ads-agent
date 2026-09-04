'use strict';
// Server-only. No HTTP/MCP registration and no caller-supplied approval flags.
// Dependencies must be constructed by trusted runtime composition, not request JSON.
const fs = require('node:fs');
const path = require('node:path');
const {createHash, createHmac, timingSafeEqual, randomUUID} = require('node:crypto');
const {prepareControlledProposal} = require('./google-controlled-proposals');
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail = code => { throw new Error(code); };
class ExecutionLedger {
  constructor({directory, integrityKey}) {
    if (!path.isAbsolute(directory) || directory === path.parse(directory).root || !Buffer.isBuffer(integrityKey) || integrityKey.length < 32) fail('invalid_execution_storage');
    const st=fs.lstatSync(directory);
    if (!st.isDirectory() || st.isSymbolicLink() || fs.realpathSync(directory)!==directory || (st.mode&0o077)) fail('unsafe_execution_storage');
    this.directory=directory; this.key=Buffer.from(integrityKey);this.seen=new Set();
  }
  syncDirectory(){const fd=fs.openSync(this.directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  file(id){if(!/^[a-f0-9]{64}$/.test(id))fail('invalid_execution_id');return path.join(this.directory,id+'.json');}
  read(id){
    const file=this.file(id);if(!fs.existsSync(file)){if(this.seen.has(id))fail('execution_record_disappeared');return null;}
    const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)||st.size>1048576)fail('unsafe_execution_record');
    const envelope=JSON.parse(fs.readFileSync(file,'utf8'));
    const expected=createHmac('sha256',this.key).update(JSON.stringify(envelope.payload)).digest();
    const actual=Buffer.from(String(envelope.mac),'hex');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected)||envelope.payload.id!==id)fail('execution_integrity_failed');
    this.seen.add(id);return envelope.payload;
  }
  write(id,payload){
    const file=this.file(id),temp=path.join(this.directory,randomUUID()+'.tmp');
    if(payload.id!==id)fail('execution_id_mismatch');
    const previous=this.read(id);
    if(!['sending','blocked','verified','uncertain','reconciliation_required'].includes(payload.status))fail('invalid_execution_status');
    if(previous&&previous.status!=='sending')fail('execution_terminal');
    if(!previous&&payload.status!=='sending')fail('execution_transition_invalid');
    payload={...payload,events:[...(previous?.events||[]),{status:payload.status,at:Date.now()}]};
    const text=JSON.stringify({payload,mac:createHmac('sha256',this.key).update(JSON.stringify(payload)).digest('hex')});
    const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temp,file);this.syncDirectory();this.seen.add(id);
  }
  async exclusive(customerId,fn){
    if(!/^\d{1,20}$/.test(customerId))fail('invalid_customer');
    const lock=path.join(this.directory,'account-'+customerId+'.lock');
    const fd=fs.openSync(lock,'wx',0o600);fs.fsyncSync(fd);fs.closeSync(fd);this.syncDirectory();
    // A process crash deliberately leaves the lock: no automatic stale-lock removal.
    try{return await fn();}finally{fs.unlinkSync(lock);this.syncDirectory();}
  }
  pending(customerId,create=false){
    const file=path.join(this.directory,'account-'+customerId+'.pending');
    if(!create)return fs.existsSync(file);
    const fd=fs.openSync(file,'wx',0o600);fs.fsyncSync(fd);fs.closeSync(fd);this.syncDirectory();
  }
  clearPending(customerId){fs.unlinkSync(path.join(this.directory,'account-'+customerId+'.pending'));this.syncDirectory();}
}
function buildBudgetMutation(proposal){
  const {action,before,customer_id:customer}=proposal;
  if(action.type!=='set_daily_budget')fail('executor_action_not_supported');
  if(!/^\d{1,20}$/.test(customer)||!/^\d{1,20}$/.test(before.budget_id))fail('invalid_resource');
  return {entity:'campaign_budget',operation:'update',resource:{resource_name:`customers/${customer}/campaignBudgets/${before.budget_id}`,amount_micros:action.amount_micros}};
}
function createSingleAttemptAdapter(customer){
  if(typeof customer?.buildMutationRequestAndService!=='function'||!/^\d{1,20}$/.test(customer.credentials?.customer_id))fail('unsupported_google_client');
  return {customerId:customer.credentials.customer_id,mutateResources:async(operations,options)=>{
    const {service,request}=customer.buildMutationRequestAndService(operations,options);
    // google-ads-api's default mutateResources retries UNAVAILABLE/DEADLINE_EXCEEDED.
    // Use the same request builder but explicitly disable gax retries for this executor.
    return (await service.mutate(request,{retry:null,timeout:15000,otherArgs:{headers:customer.callHeaders}}))[0];
  }};
}
function createControlledExecutor({journal,ledger,customer,readSnapshot,readSafety,readPolicy,killSwitch,now=Date.now}){
  for(const fn of [readSnapshot,readSafety,readPolicy,killSwitch,now])if(typeof fn!=='function')fail('trusted_runtime_dependencies_required');
  if(!(ledger instanceof ExecutionLedger)||!journal||typeof journal.get!=='function'||typeof customer?.mutateResources!=='function')fail('trusted_runtime_dependencies_required');
  async function execute(proposalId){
    if(!/^[a-f0-9]{64}$/.test(proposalId))fail('invalid_proposal_id');
    const initial=await journal.get(proposalId);
    if(!initial?.proposal)fail('approved_proposal_required');
    const owner=initial.proposal.customer_id;
    if(customer.customerId!==owner)fail('mutation_customer_mismatch');
    return ledger.exclusive(owner,async()=>{
      const previous=ledger.read(proposalId);
      if(previous)return {status:previous.status,id:proposalId,replayed:true,writes_executed:false};
      if(ledger.pending(owner))fail('account_reconciliation_required');
      const approval=await journal.get(proposalId), proposal=approval?.proposal;
      if(approval?.approval_current!==true||approval.status!=='approved'||hash(proposal)!==proposalId)fail('approved_proposal_required');
      const check=async()=>{
        if(await killSwitch()!==false)fail('kill_switch_active');
        const current=await journal.get(proposalId);
        if(current?.approval_current!==true||current.status!=='approved')fail('approval_revoked');
        const clock=now();if(!Number.isSafeInteger(clock)||Date.parse(proposal.expires_at)<=clock)fail('proposal_expired');
        const policy=await readPolicy();if(hash(policy)!==proposal.policy_digest)fail('policy_changed');
        const snapshot=await readSnapshot();
        if(!proposal.inventory_state_digest||hash({...snapshot,captured_at:undefined})!==proposal.inventory_state_digest)fail('snapshot_changed');
        const prepared=prepareControlledProposal({action:proposal.action,policy,snapshot,now:clock,kill_switch:false});
        if(!prepared.policy_fit)fail('policy_gate_failed');
        const safety=await readSafety();
        // Evidence must be live, account-bound, reconciled and certified by a trusted gate.
        // A configured average budget or client boolean must never produce this evidence.
        if(safety?.customer_id!==owner||safety.currency!=='EUR'||safety.time_zone!=='Europe/Berlin'||
          safety.hard_daily_spend_cap_verified!==true||safety.today_history_reconciled!==true||
          !Number.isSafeInteger(safety.maximum_billable_today_micros)||safety.maximum_billable_today_micros>10000000||safety.maximum_billable_today_micros<0||
          !Number.isSafeInteger(safety.reported_cost_micros)||safety.reported_cost_micros<0||safety.reported_cost_micros>10000000||
          !Number.isSafeInteger(safety.checked_at)||clock-safety.checked_at<0||clock-safety.checked_at>5000||
          safety.proposal_id!==proposalId||safety.audit_storage_durable!==true||safety.live_execution_gate!==true)fail('economic_or_runtime_gate_unverified');
        return snapshot;
      };
      const before=await check();const mutation=buildBudgetMutation(proposal);
      await customer.mutateResources([mutation],{validate_only:true,partial_failure:false});
      await check();
      const record={id:proposalId,status:'sending',before,mutation,rollback:{type:'set_daily_budget',campaign_id:proposal.action.campaign_id,amount_micros:proposal.before.daily_budget_micros},created_at:now()};
      ledger.pending(owner,true);
      ledger.write(proposalId,record);
      // Once sending is durable, this ID can never send again, even after a timeout/crash.
      if(await killSwitch()!==false){record.status='blocked';ledger.write(proposalId,record);ledger.clearPending(owner);fail('kill_switch_active');}
      try{
        await customer.mutateResources([mutation],{validate_only:false,partial_failure:false});
        const after=await readSnapshot();
        const expected=structuredClone(before);const target=expected.campaigns.find(c=>c.campaign_id===proposal.action.campaign_id);
        target.daily_budget_micros=proposal.action.amount_micros;
        // Capture time necessarily changes; all account/campaign fields must match.
        expected.captured_at=after.captured_at;
        record.after=after;
        record.status=hash(after)===hash(expected)?'verified':'reconciliation_required';
        record.finished_at=now();ledger.write(proposalId,record);
        if(record.status==='verified')ledger.clearPending(owner);
        return {id:proposalId,status:record.status,writes_executed:true};
      }catch{
        record.status='uncertain';record.finished_at=now();ledger.write(proposalId,record);
        return {id:proposalId,status:'uncertain',writes_executed:'unknown'};
      }
    });
  }
  // Rollback is a fresh policy/preflight-checked proposal, never an unchecked compensating write.
  return {execute};
}
module.exports={ExecutionLedger,buildBudgetMutation,createControlledExecutor,createSingleAttemptAdapter};
