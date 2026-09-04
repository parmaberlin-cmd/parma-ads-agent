'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { authorizeAutonomy } = require('./autonomy-policy');
const { classifyApiFailure } = require('./runtime-resilience');

const TERMINAL = new Set(['NEEDS_HUMAN','BLOCKED_EXTERNAL','DONE']);
const ACTIVE = new Set(['READY','RUNNING','RETRY_WAIT']);
const DEFAULT_FILE = '/tmp/parma-autonomous-runtime.json';
const VOLUME_FILE = 'parma-autonomous-runtime.json';

function nowIso(now = () => Date.now()) { return new Date(now()).toISOString(); }
function statePath(env = process.env) {
  if (env.AUTONOMOUS_RUNTIME_STATE_PATH) return env.AUTONOMOUS_RUNTIME_STATE_PATH;
  if (env.RAILWAY_VOLUME_MOUNT_PATH) return path.join(env.RAILWAY_VOLUME_MOUNT_PATH, VOLUME_FILE);
  return DEFAULT_FILE;
}
function storageStatus(env = process.env) {
  const p = statePath(env); const durable = Boolean(env.AUTONOMOUS_RUNTIME_STATE_PATH || env.RAILWAY_VOLUME_MOUNT_PATH) && !p.startsWith('/tmp/');
  return { durable, path_class: durable ? 'durable_candidate' : 'ephemeral', source: env.AUTONOMOUS_RUNTIME_STATE_PATH ? 'explicit_path' : env.RAILWAY_VOLUME_MOUNT_PATH ? 'railway_volume' : 'default_tmp' };
}
function emptyState(now = () => Date.now()) { return { version:1, runner:{ status:'IDLE', started_at:null, heartbeat_at:null, last_error:null, kill_switch:false }, objectives:[], audit:[], updated_at:nowIso(now) }; }
function sanitizeText(v, n=240){ return String(v ?? '').replace(/[\r\n\t]/g,' ').slice(0,n); }
function secretShaped(v){ return /(?:token|secret|password|api[_-]?key|authorization|bearer)/i.test(String(v)); }
function sanitizeEvidence(value){
  if (value == null || ['string','number','boolean'].includes(typeof value)) return secretShaped(value) ? '[redacted]' : (typeof value === 'string' ? sanitizeText(value,500) : value);
  if (Array.isArray(value)) return value.slice(0,20).map(sanitizeEvidence);
  if (typeof value === 'object') { const out={}; for (const [k,v] of Object.entries(value).slice(0,40)) out[k]=secretShaped(k)?'[redacted]':sanitizeEvidence(v); return out; }
  return sanitizeText(value);
}
function normalizeTask(task={}, index=0){
  return { id:sanitizeText(task.id || `task-${index+1}`,80), kind:sanitizeText(task.kind,80), status:'PENDING', attempts:0, max_attempts:Math.max(1,Math.min(10,Number(task.max_attempts||3))), depends_on:Array.isArray(task.depends_on)?task.depends_on.map(x=>sanitizeText(x,80)):[], evidence:[], errors:[], retry:{ next_attempt_at:null, backoff_ms:0 }, lease:null, idempotency_key:sanitizeText(task.idempotency_key || '',120) || null, next_action:null, stop_reason:null, created_at:null, updated_at:null, completed_at:null };
}
function normalizeObjective(input={}, now=()=>Date.now()){
  const created=nowIso(now); const id=sanitizeText(input.id || crypto.randomUUID(),100);
  const tasks=(input.tasks||[]).map((t,i)=>normalizeTask(t,i)); tasks.forEach(t=>{t.created_at=created;t.updated_at=created;t.idempotency_key=t.idempotency_key||`${id}:${t.id}`;});
  return { id, objective:sanitizeText(input.objective,1000), status:'READY', tasks, current_task_id:null, next_action:'select_next_task', stop_reason:null, evidence:[], errors:[], created_at:created, updated_at:created, completed_at:null };
}
function readState(file=statePath(), now=()=>Date.now()) { if(!fs.existsSync(file)) return emptyState(now); try { const p=JSON.parse(fs.readFileSync(file,'utf8')); return p&&p.version===1?p:emptyState(now); } catch { return emptyState(now); } }
function writeState(state,file=statePath(),now=()=>Date.now()) { state.updated_at=nowIso(now); fs.mkdirSync(path.dirname(file),{recursive:true}); const tmp=`${file}.${process.pid}.tmp`; fs.writeFileSync(tmp,`${JSON.stringify(state)}\n`,{mode:0o600}); fs.renameSync(tmp,file); return state; }
function audit(state,type,data={},now=()=>Date.now()){ state.audit.push({at:nowIso(now),type:sanitizeText(type,80),data:sanitizeEvidence(data)}); if(state.audit.length>1000) state.audit=state.audit.slice(-1000); }
function acquireFileLock(file,{now=()=>Date.now(),leaseMs=30000}={}){
  const lock=`${file}.lock`; try { fs.mkdirSync(lock); fs.writeFileSync(path.join(lock,'lease.json'),JSON.stringify({pid:process.pid,expires_at:now()+leaseMs})); return {ok:true,lock}; } catch {
    try { const meta=JSON.parse(fs.readFileSync(path.join(lock,'lease.json'),'utf8')); if(Number(meta.expires_at)<now()){ fs.rmSync(lock,{recursive:true,force:true}); return acquireFileLock(file,{now,leaseMs}); } } catch {}
    return {ok:false,lock};
  }
}
function releaseFileLock(lock){ try{fs.rmSync(lock,{recursive:true,force:true});}catch{} }
function withLockedState(file, fn, opts={}){ const l=acquireFileLock(file,opts); if(!l.ok) return {locked:false}; try{const state=readState(file,opts.now); const value=fn(state); writeState(state,file,opts.now); return {locked:true,state,value};}finally{releaseFileLock(l.lock);} }
function dependenciesMet(task,tasks){ return task.depends_on.every(id=>tasks.some(t=>t.id===id&&t.status==='DONE')); }
function selectTask(objective,now=()=>Date.now()){
  const ms=now(); return objective.tasks.find(t=>t.status==='PENDING'&&dependenciesMet(t,objective.tasks)) || objective.tasks.find(t=>t.status==='RETRY_WAIT'&&(!t.retry.next_attempt_at||Date.parse(t.retry.next_attempt_at)<=ms)&&dependenciesMet(t,objective.tasks)) || null;
}
function backoffMs(attempt){ return Math.min(15*60*1000, 1000 * (2 ** Math.max(0,attempt-1))); }
function publicSnapshot(state){
  const active=state.objectives.find(o=>ACTIVE.has(o.status))||null; const current=active?.tasks.find(t=>t.id===active.current_task_id)||null; const next=active?selectTask(active):null;
  const lastCompleted=[...state.objectives].flatMap(o=>o.tasks.map(t=>({o,t}))).filter(x=>x.t.status==='DONE').sort((a,b)=>String(b.t.completed_at).localeCompare(String(a.t.completed_at)))[0]||null;
  return { runner:{...state.runner}, active_objective:active?{id:active.id,objective:active.objective,status:active.status}:null, last_task_completed:lastCompleted?{objective_id:lastCompleted.o.id,id:lastCompleted.t.id,kind:lastCompleted.t.kind,completed_at:lastCompleted.t.completed_at}:null, current_task:current?{id:current.id,kind:current.kind,status:current.status,attempts:current.attempts}:null, next_task:next?{id:next.id,kind:next.kind,status:next.status}:null, last_error:state.runner.last_error, stop_reason:active?.stop_reason||null, storage:null, updated_at:state.updated_at };
}

class AutonomousRuntime {
  constructor({file=statePath(),env=process.env,now=()=>Date.now(),handlers={},tickMs=2000,leaseMs=30000}={}){ this.file=file;this.env=env;this.now=now;this.handlers=handlers;this.tickMs=tickMs;this.leaseMs=leaseMs;this.timer=null;this.workerId=`${process.pid}-${crypto.randomUUID()}`; }
  submit(input){ const r=withLockedState(this.file,(s)=>{ const o=normalizeObjective(input,this.now); s.objectives.push(o); audit(s,'objective_submitted',{objective_id:o.id,task_count:o.tasks.length},this.now); return o; },{now:this.now,leaseMs:this.leaseMs}); return r.value; }
  setKillSwitch(active){ const r=withLockedState(this.file,s=>{s.runner.kill_switch=Boolean(active);audit(s,'kill_switch',{active:Boolean(active)},this.now);},{now:this.now,leaseMs:this.leaseMs}); return r.locked; }
  snapshot(){ const s=readState(this.file,this.now); const p=publicSnapshot(s); p.storage=storageStatus(this.env); return p; }
  start(){ if(this.timer) return; withLockedState(this.file,s=>{s.runner.status='RUNNING';s.runner.started_at=s.runner.started_at||nowIso(this.now);s.runner.heartbeat_at=nowIso(this.now);audit(s,'runner_started',{worker_id:this.workerId},this.now);},{now:this.now,leaseMs:this.leaseMs}); this.tick().catch(()=>{}); this.timer=setInterval(()=>this.tick().catch(()=>{}),this.tickMs); if(this.timer.unref)this.timer.unref(); }
  stop(){ if(this.timer)clearInterval(this.timer);this.timer=null; }
  async tick(){
    const claim=withLockedState(this.file,s=>{
      s.runner.heartbeat_at=nowIso(this.now); if(s.runner.kill_switch){s.runner.status='STOPPED'; return null;} s.runner.status='RUNNING';
      const obj=s.objectives.find(o=>ACTIVE.has(o.status)); if(!obj) return null;
      let task=selectTask(obj,this.now); if(!task){ if(obj.tasks.every(t=>t.status==='DONE')){obj.status='DONE';obj.stop_reason='objective_verified';obj.completed_at=nowIso(this.now);obj.updated_at=nowIso(this.now);obj.current_task_id=null;audit(s,'objective_done',{objective_id:obj.id},this.now);} return null; }
      const auth=authorizeAutonomy({name:task.kind},{kill_switch:s.runner.kill_switch,human_approved:false});
      if(!auth.allowed){ task.status='NEEDS_HUMAN';task.stop_reason=auth.reason;task.updated_at=nowIso(this.now);obj.status='NEEDS_HUMAN';obj.stop_reason=auth.reason;obj.current_task_id=task.id;obj.next_action='human_decision';audit(s,'needs_human',{objective_id:obj.id,task_id:task.id,reason:auth.reason},this.now);return null; }
      const duplicate=obj.tasks.some(t=>t.id!==task.id&&t.idempotency_key===task.idempotency_key&&t.status==='DONE'); if(duplicate){task.status='DONE';task.completed_at=nowIso(this.now);task.updated_at=task.completed_at;audit(s,'task_idempotent_skip',{objective_id:obj.id,task_id:task.id},this.now);return null;}
      if(task.lease&&Date.parse(task.lease.expires_at)>this.now()&&task.lease.owner!==this.workerId) return null;
      task.status='RUNNING';task.attempts+=1;task.lease={owner:this.workerId,expires_at:new Date(this.now()+this.leaseMs).toISOString()};task.updated_at=nowIso(this.now);obj.status='RUNNING';obj.current_task_id=task.id;obj.next_action='execute';obj.updated_at=nowIso(this.now);audit(s,'task_claimed',{objective_id:obj.id,task_id:task.id,attempt:task.attempts},this.now); return {objective_id:obj.id,task:{...task}};
    },{now:this.now,leaseMs:this.leaseMs});
    if(!claim.locked||!claim.value)return;
    const c=claim.value; const handler=this.handlers[c.task.kind]; let result;
    try { if(typeof handler!=='function'){ const e=new Error('capability_handler_unavailable'); e.code='CAPABILITY_UNAVAILABLE'; throw e; } result=await handler({objective_id:c.objective_id,task:c.task}); }
    catch(error){
      const cls=classifyApiFailure(error); const transient=cls==='transient'; const final=withLockedState(this.file,s=>{ const o=s.objectives.find(x=>x.id===c.objective_id);const t=o?.tasks.find(x=>x.id===c.task.id);if(!o||!t||t.status!=='RUNNING'||t.lease?.owner!==this.workerId)return; const err={at:nowIso(this.now),class:cls||'unknown',code:sanitizeText(error.code||'execution_failed',80)};t.errors.push(err);t.lease=null;t.updated_at=nowIso(this.now);s.runner.last_error={objective_id:o.id,task_id:t.id,...err}; if(transient&&t.attempts<t.max_attempts){const wait=backoffMs(t.attempts);t.status='RETRY_WAIT';t.retry={backoff_ms:wait,next_attempt_at:new Date(this.now()+wait).toISOString()};o.status='RETRY_WAIT';o.next_action='retry_after_backoff';audit(s,'task_retry_scheduled',{objective_id:o.id,task_id:t.id,attempt:t.attempts,backoff_ms:wait},this.now);}else{t.status='BLOCKED_EXTERNAL';t.stop_reason=transient?'retry_limit_reached':'provider_or_capability_blocked';o.status='BLOCKED_EXTERNAL';o.stop_reason=t.stop_reason;o.next_action='external_unblock';audit(s,'blocked_external',{objective_id:o.id,task_id:t.id,reason:t.stop_reason},this.now);} },{now:this.now,leaseMs:this.leaseMs}); return final;
    }
    withLockedState(this.file,s=>{ const o=s.objectives.find(x=>x.id===c.objective_id);const t=o?.tasks.find(x=>x.id===c.task.id);if(!o||!t||t.status!=='RUNNING'||t.lease?.owner!==this.workerId)return; const valid=result?.validated===true; t.evidence.push(sanitizeEvidence(result?.evidence||{}));t.lease=null;t.updated_at=nowIso(this.now); if(valid){t.status='DONE';t.completed_at=nowIso(this.now);t.next_action='next_task';o.current_task_id=null;o.status='READY';o.next_action='select_next_task';audit(s,'task_done',{objective_id:o.id,task_id:t.id,attempt:t.attempts},this.now);}else{t.status='BLOCKED_EXTERNAL';t.stop_reason='validation_failed';o.status='BLOCKED_EXTERNAL';o.stop_reason='validation_failed';o.next_action='external_unblock';audit(s,'validation_failed',{objective_id:o.id,task_id:t.id},this.now);} },{now:this.now,leaseMs:this.leaseMs});
  }
}

module.exports={AutonomousRuntime,TERMINAL,ACTIVE,statePath,storageStatus,emptyState,normalizeObjective,readState,writeState,withLockedState,acquireFileLock,releaseFileLock,dependenciesMet,selectTask,backoffMs,publicSnapshot,sanitizeEvidence};
