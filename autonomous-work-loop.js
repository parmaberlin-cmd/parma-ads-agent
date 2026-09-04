'use strict';

const { authorizeAutonomy } = require('./autonomy-policy');

const STATES = Object.freeze({ READY:'READY', EXECUTE:'EXECUTE', VALIDATE_L1:'VALIDATE_L1', VALIDATE_L2:'VALIDATE_L2', FIX:'FIX', NEXT:'NEXT', NEEDS_HUMAN:'NEEDS_HUMAN', BLOCKED_EXTERNAL:'BLOCKED_EXTERNAL', DONE:'DONE' });
const SAFE_KINDS = new Set(['collect_metrics','refresh_shadow_snapshot','run_diagnostics','generate_report','score_recommendation','simulate_budget']);

function normalizeTask(task={}) { return { id:String(task.id||''), kind:String(task.kind||''), status:String(task.status||'pending'), attempts:Number(task.attempts||0), max_attempts:Math.max(1,Number(task.max_attempts||3)), depends_on:Array.isArray(task.depends_on)?task.depends_on.map(String):[], evidence:Array.isArray(task.evidence)?task.evidence:[] }; }
function dependenciesMet(task, tasks){ return task.depends_on.every(id=>tasks.some(t=>t.id===id&&t.status==='done')); }
function nextTask(state={}) { const tasks=(state.tasks||[]).map(normalizeTask); return tasks.find(t=>t.status==='pending'&&dependenciesMet(t,tasks))||null; }
function decisionQuestions({task,context={}}={}){
 const authorization=authorizeAutonomy({name:task?.kind},{...context,human_approved:false});
 return {
  data_sufficient: context.data_sufficient!==false,
  fresh_enough: context.fresh_enough!==false,
  source_healthy: context.source_healthy!==false,
  safe_kind: SAFE_KINDS.has(task?.kind),
  authorization,
  needs_human: !authorization.allowed,
  external_blocker: Boolean(context.external_blocker),
 };
}
function decide(state={},context={}){
 const task=nextTask(state); if(!task)return{state:STATES.DONE,task:null,reason:'no_runnable_tasks'};
 const q=decisionQuestions({task,context});
 if(q.external_blocker)return{state:STATES.BLOCKED_EXTERNAL,task,reason:'external_blocker',questions:q};
 if(q.needs_human)return{state:STATES.NEEDS_HUMAN,task,reason:q.authorization.reason,questions:q};
 if(!q.data_sufficient||!q.fresh_enough||!q.source_healthy)return{state:STATES.VALIDATE_L2,task,reason:'live_evidence_required',questions:q};
 return{state:STATES.EXECUTE,task,reason:'safe_autonomous_task',questions:q};
}
function afterExecution(task,result={}){
 if(result.level1_passed!==true)return task.attempts+1<task.max_attempts?{state:STATES.FIX,reason:'level1_failed'}:{state:STATES.BLOCKED_EXTERNAL,reason:'level1_attempt_limit'};
 if(result.level2_required!==false&&result.level2_passed!==true)return{state:STATES.VALIDATE_L2,reason:'level2_required'};
 return{state:STATES.NEXT,reason:'validated'};
}
module.exports={STATES,SAFE_KINDS,normalizeTask,dependenciesMet,nextTask,decisionQuestions,decide,afterExecution};
