'use strict';

const {withLockedState,statePath,sanitizeEvidence}=require('./autonomous-runtime');
const {describeAction}=require('./action-registry');

const RESUMABLE=new Set(['NEEDS_HUMAN','BLOCKED_EXTERNAL']);
const MODES=new Set(['retry','completed_externally']);
function cleanText(value,max=500){return String(value||'').replace(/[\r\n\t]/g,' ').trim().slice(0,max);}
function requiredActionFor(task,status,reason){
  const action=describeAction(task.kind);
  if(status==='NEEDS_HUMAN')return {type:'human_action',action:'resolve_or_delegate_task',task_kind:task.kind,specialist:action.specialist,reason:cleanText(reason,160),resume_options:['retry','completed_externally']};
  return {type:'external_unblock',action:'restore_provider_or_capability_then_retry',task_kind:task.kind,specialist:action.specialist,reason:cleanText(reason,160),resume_options:['retry']};
}
function annotateTerminalBlockers(state){
  let changed=false;
  for(const objective of state.objectives||[]){
    if(!RESUMABLE.has(objective.status))continue;
    const task=(objective.tasks||[]).find(t=>t.status===objective.status)||null;
    if(!task)continue;
    const required=requiredActionFor(task,objective.status,task.stop_reason||objective.stop_reason);
    if(!task.required_action){task.required_action=required;changed=true;}
    if(!objective.required_action){objective.required_action=required;changed=true;}
  }
  return changed;
}
function persistTerminalBlockers(runtime){
  const file=runtime?.file||statePath();
  const result=withLockedState(file,state=>annotateTerminalBlockers(state),{leaseMs:runtime?.leaseMs||30000});
  if(!result.locked)return false;
  return result.value===true;
}
function resumeObjective(runtime,{objective_id,task_id,mode,note,actor='authorized_operator'}={}){
  const objectiveId=cleanText(objective_id,100), taskId=cleanText(task_id,80), resolution=cleanText(mode,40);
  if(!objectiveId||!taskId||!MODES.has(resolution)){const e=new Error('invalid_resume_request');e.code='INVALID_RESUME_REQUEST';throw e;}
  const file=runtime?.file||statePath();
  const result=withLockedState(file,state=>{
    annotateTerminalBlockers(state);
    const objective=state.objectives.find(o=>o.id===objectiveId);
    if(!objective){const e=new Error('objective_not_found');e.code='OBJECTIVE_NOT_FOUND';throw e;}
    if(!RESUMABLE.has(objective.status)){const e=new Error('objective_not_resumable');e.code='OBJECTIVE_NOT_RESUMABLE';throw e;}
    const task=objective.tasks.find(t=>t.id===taskId&&RESUMABLE.has(t.status));
    if(!task){const e=new Error('blocked_task_not_found');e.code='BLOCKED_TASK_NOT_FOUND';throw e;}
    if(objective.status==='BLOCKED_EXTERNAL'&&resolution!=='retry'){const e=new Error('blocked_external_retry_only');e.code='BLOCKED_EXTERNAL_RETRY_ONLY';throw e;}
    const at=new Date().toISOString();
    const evidence=sanitizeEvidence({schema:'runtime.objective_resume.v1',resolution,actor:cleanText(actor,80),note:cleanText(note,500),previous_status:task.status,previous_reason:task.stop_reason,required_action:task.required_action||requiredActionFor(task,task.status,task.stop_reason)});
    task.evidence.push(evidence);
    task.errors=task.errors||[];
    task.retry={next_attempt_at:null,backoff_ms:0};
    task.lease=null;
    task.stop_reason=null;
    task.required_action=null;
    task.updated_at=at;
    if(resolution==='completed_externally'){
      task.status='DONE';task.completed_at=at;task.next_action='next_task';
    }else{
      task.status='PENDING';task.completed_at=null;task.next_action='retry_after_resolution';
    }
    objective.status='READY';objective.current_task_id=null;objective.stop_reason=null;objective.required_action=null;objective.next_action='select_next_task';objective.completed_at=null;objective.updated_at=at;
    state.audit.push({at,type:'objective_resumed',data:sanitizeEvidence({objective_id:objective.id,task_id:task.id,resolution,specialist:describeAction(task.kind).specialist})});
    if(state.audit.length>1000)state.audit=state.audit.slice(-1000);
    return {objective_id:objective.id,task_id:task.id,status:objective.status,resolution};
  },{leaseMs:runtime?.leaseMs||30000});
  if(!result.locked){const e=new Error('state_lock_busy');e.code='STATE_LOCK_BUSY';throw e;}
  return result.value;
}
function registerAutonomousResumeRoutes(app,{authorized,runtime}={}){
  app.post('/tools/agent/objectives/resume',require('express').json({limit:'16kb'}),(req,res)=>{
    if(!authorized?.(req))return res.status(401).json({success:false,error:'Unauthorized'});
    try{return res.status(202).json({success:true,...resumeObjective(runtime,req.body||{})});}
    catch(error){const code=error?.code||'RESUME_FAILED';const status=code==='OBJECTIVE_NOT_FOUND'||code==='BLOCKED_TASK_NOT_FOUND'?404:code==='STATE_LOCK_BUSY'?409:400;return res.status(status).json({success:false,error:code});}
  });
}
module.exports={RESUMABLE,MODES,requiredActionFor,annotateTerminalBlockers,persistTerminalBlockers,resumeObjective,registerAutonomousResumeRoutes};
