'use strict';
// Preparation journal only. No route, OAuth scope, Google mutation or execution adapter.
const fs = require('node:fs');
const path = require('node:path');
const {createHash,createHmac,timingSafeEqual,randomBytes}=require('node:crypto');
const {prepareControlledProposal}=require('./google-controlled-proposals');
const {z}=require('zod');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const actor=z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
const status=z.enum(['proposed','approved','rejected','cancelled','expired']);
const event=z.object({state:status,actor_id:actor,at:z.string().datetime()}).strict();
const record=z.object({proposal_id:digest,proposal:z.record(z.unknown()),status,
  history:z.array(event).min(1).max(3)}).strict();
const stateSchema=z.object({version:z.literal(1),records:z.array(record).max(1000)}).strict();
function fail(code){throw new Error(code);}
const view=r=>({...structuredClone(r),mode:'prepare_only',execution_allowed:false,writes_allowed:false,spend_allowed:false});
class ControlledProposalJournal {
  constructor({directory,integrityKey,resolveActor,now=Date.now}) {
    if(typeof directory!=='string'||!path.isAbsolute(directory)||directory===path.parse(directory).root||
       !Buffer.isBuffer(integrityKey)||integrityKey.length<32||typeof resolveActor!=='function'||typeof now!=='function')
      fail('journal_configuration_invalid');
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    if(fs.realpathSync(directory)!==directory||!fs.lstatSync(directory).isDirectory())fail('journal_directory_invalid');
    fs.chmodSync(directory,0o700);
    this.directory=directory;this.file=path.join(directory,'proposals.json');
    this.key=Buffer.from(integrityKey);this.resolveActor=resolveActor;this.now=now;
    this.seenFile=false;
    this.read();
  }
  clock(){const value=this.now();if(!Number.isSafeInteger(value)||!Number.isFinite(new Date(value).getTime()))fail('journal_clock_invalid');return value;}
  principal(){
    // Callback is supplied only by authenticated server code. Public body fields are not accepted.
    const parsed=actor.safeParse(this.resolveActor());
    if(!parsed.success)fail('journal_actor_required');return parsed.data;
  }
  mac(payload){return createHmac('sha256',this.key).update(payload).digest('hex');}
  validate(state){
    const parsed=stateSchema.safeParse(state);if(!parsed.success)fail('journal_corrupt');
    const ids=new Set();
    for(const r of parsed.data.records){
      if(ids.has(r.proposal_id)||hash(r.proposal)!==r.proposal_id||r.status!==r.history.at(-1).state||
         r.history[0].state!=='proposed'||!Number.isFinite(Date.parse(r.proposal.expires_at))||
         !Number.isFinite(Date.parse(r.proposal.created_at)))fail('journal_corrupt');
      for(let i=1;i<r.history.length;i++){
        const prev=r.history[i-1],next=r.history[i];
        if(Date.parse(next.at)<Date.parse(prev.at)||
           !(prev.state==='proposed'&&['approved','rejected','cancelled','expired'].includes(next.state)||
             prev.state==='approved'&&['cancelled','expired'].includes(next.state)))fail('journal_corrupt');
      }
      ids.add(r.proposal_id);
    }
    return parsed.data;
  }
  read(){
    let st;
    try{st=fs.lstatSync(this.file);}catch(error){
      if(error.code!=='ENOENT')fail('journal_file_invalid');
      if(this.seenFile)fail('journal_disappeared');return {version:1,records:[]};
    }
    if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>4*1024*1024)fail('journal_file_invalid');
    let envelope;
    try{envelope=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{fail('journal_corrupt');}
    if(typeof envelope?.payload!=='string'||!digest.safeParse(envelope.mac).success)fail('journal_corrupt');
    const mac=this.mac(envelope.payload);
    if(!timingSafeEqual(Buffer.from(mac),Buffer.from(envelope.mac)))fail('journal_integrity_failed');
    let state;try{state=JSON.parse(envelope.payload);}catch{fail('journal_corrupt');}
    state=this.validate(state);fs.chmodSync(this.file,0o600);this.seenFile=true;return state;
  }
  persist(state){
    this.validate(state);
    const payload=JSON.stringify(state);
    if(Buffer.byteLength(payload)>3*1024*1024)fail('journal_capacity_reached');
    const temporary=path.join(this.directory,`.proposals-${randomBytes(12).toString('hex')}.tmp`);
    let fd;
    try{
      fd=fs.openSync(temporary,'wx',0o600);
      fs.writeFileSync(fd,JSON.stringify({payload,mac:this.mac(payload)}));fs.fsyncSync(fd);
      fs.closeSync(fd);fd=undefined;
      fs.renameSync(temporary,this.file);this.seenFile=true;
      const dir=fs.openSync(this.directory,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
    }finally{
      if(fd!==undefined)fs.closeSync(fd);
      if(fs.existsSync(temporary))fs.unlinkSync(temporary);
    }
  }
  transact(change){
    const lock=path.join(this.directory,'proposals.lock');let fd;
    try{fd=fs.openSync(lock,'wx',0o600);}catch{fail('journal_locked');}
    try{
      const state=this.read();const result=change(state);this.persist(state);return view(result);
    }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  }
  propose(input){
    const actorId=this.principal(),now=this.clock();
    // Construct only known evaluator inputs. now and approval fields cannot override server state.
    const prepared=prepareControlledProposal({action:input?.action,policy:input?.policy,snapshot:input?.snapshot,now,
      kill_switch:input?.kill_switch===undefined?false:input.kill_switch});
    if(!prepared.policy_fit)fail('journal_proposal_blocked');
    return this.transact(state=>{
      if(state.records.some(r=>r.proposal_id===prepared.proposal_id))fail('journal_duplicate_proposal');
      const r={proposal_id:prepared.proposal_id,proposal:prepared.proposal,status:'proposed',
        history:[{state:'proposed',actor_id:actorId,at:new Date(now).toISOString()}]};
      state.records.push(r);return r;
    });
  }
  decide({proposalId,expectedDigest,decision}={}){
    const actorId=this.principal(),now=this.clock();
    if(!digest.safeParse(proposalId).success||expectedDigest!==proposalId||
       !['approved','rejected','cancelled'].includes(decision))fail('journal_decision_invalid');
    return this.transact(state=>{
      const r=state.records.find(r=>r.proposal_id===proposalId);if(!r)fail('journal_proposal_missing');
      if(!['proposed','approved'].includes(r.status))fail('journal_transition_blocked');
      if(now<Date.parse(r.history.at(-1).at))fail('journal_clock_reversed');
      if(now>=Date.parse(r.proposal.expires_at)){
        r.status='expired';r.history.push({state:'expired',actor_id:actorId,at:new Date(now).toISOString()});return r;
      }
      if(r.status==='approved'&&decision!=='cancelled')fail('journal_transition_blocked');
      r.status=decision;r.history.push({state:decision,actor_id:actorId,at:new Date(now).toISOString()});return r;
    });
  }
  get(proposalId){
    this.principal();const now=this.clock();
    const r=this.read().records.find(r=>r.proposal_id===proposalId);if(!r)return null;
    return {...view(r),approval_current:r.status==='approved'&&now>=Date.parse(r.history.at(-1).at)&&now<Date.parse(r.proposal.expires_at)};
  }
}
module.exports={ControlledProposalJournal};
