'use strict';
const loop=require('./autonomous-work-loop');const {validationPlan}=require('./risk-based-validation');const store=require('./control-tower-state');
const TERMINAL=new Set(['NEEDS_HUMAN','BLOCKED_EXTERNAL','DONE']);
function classifyError(error){const code=String(error?.code||error?.message||'unknown').toLowerCase();if(/auth|permission|login|approval/.test(code))return'NEEDS_HUMAN';if(/network|timeout|rate|external|provider/.test(code))return'BLOCKED_EXTERNAL';return'FIX';}
function taskKey(task){return String(task?.id||'');}
function hasCompletedKey(state,key){return state.events.some(e=>e.type==='task_completed'&&e.idempotency_key===key);}
async function runUntilStop({file=store.statePath(),context={},executors={},maxSteps=50}={}){
  const loaded=store.load(file);if(!loaded.exists||!loaded.healthy||!loaded.state)throw new Error(loaded.reason||'autonomous_state_missing');
  for(let step=0;step<maxSteps;step++){
    let state=store.load(file).state;if(TERMINAL.has(state.status))return state;
    const decision=loop.decide({tasks:state.tasks},context);
    if(TERMINAL.has(decision.state)){return store.update(file,s=>store.appendEvent({...s,status:decision.state,current_task_id:null,next_task_id:null},{type:'stop',reason:decision.reason||decision.state}));}
    const task=decision.task;const id=taskKey(task);const key=String(task.idempotency_key||id);
    if(hasCompletedKey(state,key)){
      store.update(file,s=>{const tasks=s.tasks.map(t=>taskKey(t)===id?{...t,status:'done'}:t);return store.appendEvent({...s,tasks,status:'NEXT',current_task_id:null,next_task_id:null},{type:'idempotent_skip',task_id:id,idempotency_key:key});});continue;
    }
    const plan=validationPlan(task.change||{});if(decision.state==='VALIDATE_L2'&&plan.live_read_only_validation){return store.update(file,s=>store.appendEvent({...s,status:'BLOCKED_EXTERNAL',current_task_id:id,blockers:[...s.blockers,{task_id:id,type:'live_validation_executor_required'}]},{type:'stop',reason:'live_validation_executor_required'}));}
    const executor=executors[task.kind];if(typeof executor!=='function'){return store.update(file,s=>store.appendEvent({...s,status:'BLOCKED_EXTERNAL',current_task_id:id,blockers:[...s.blockers,{task_id:id,type:'executor_missing'}]},{type:'stop',reason:'executor_missing'}));}
    store.update(file,s=>store.appendEvent({...s,status:'EXECUTE',current_task_id:id,next_task_id:null},{type:'task_started',task_id:id,idempotency_key:key}));
    try{
      const result=await executor(task,{validation:plan,state:store.load(file).state});
      const after=loop.afterExecution(task,{...result,level2_required:plan.live_read_only_validation});
      if(after.state==='NEXT'){
        store.update(file,s=>{const tasks=s.tasks.map(t=>taskKey(t)===id?{...t,status:'done',result:result.result||null,error:null}:t);return store.appendEvent({...s,tasks,status:'NEXT',current_task_id:null},{type:'task_completed',task_id:id,idempotency_key:key});});continue;
      }
      if(after.state==='FIX'){
        const updated=store.update(file,s=>{const tasks=s.tasks.map(t=>taskKey(t)===id?{...t,attempts:Number(t.attempts||0)+1,error:String(result.reason||'validation_failed').slice(0,120)}:t);const current=tasks.find(t=>taskKey(t)===id);const terminal=current.attempts>=Number(current.max_attempts||3);return store.appendEvent({...s,tasks,status:terminal?'BLOCKED_EXTERNAL':'FIX',current_task_id:id,blockers:terminal?[...s.blockers,{task_id:id,type:'retry_exhausted'}]:s.blockers},{type:terminal?'stop':'retry_scheduled',task_id:id,reason:current.error});});if(TERMINAL.has(updated.status))return updated;continue;
      }
      return store.update(file,s=>store.appendEvent({...s,status:after.state,current_task_id:id},{type:'stop',reason:after.reason||after.state}));
    }catch(error){
      const kind=classifyError(error);if(kind==='FIX'){
        const updated=store.update(file,s=>{const tasks=s.tasks.map(t=>taskKey(t)===id?{...t,attempts:Number(t.attempts||0)+1,error:'executor_failed'}:t);const current=tasks.find(t=>taskKey(t)===id);const terminal=current.attempts>=Number(current.max_attempts||3);return store.appendEvent({...s,tasks,status:terminal?'BLOCKED_EXTERNAL':'FIX',blockers:terminal?[...s.blockers,{task_id:id,type:'retry_exhausted'}]:s.blockers},{type:terminal?'stop':'retry_scheduled',task_id:id,reason:'executor_failed'});});if(TERMINAL.has(updated.status))return updated;continue;}
      return store.update(file,s=>store.appendEvent({...s,status:kind,blockers:[...s.blockers,{task_id:id,type:kind.toLowerCase()}]},{type:'stop',reason:kind.toLowerCase()}));
    }
  }
  return store.update(file,s=>store.appendEvent({...s,status:'BLOCKED_EXTERNAL',blockers:[...s.blockers,{type:'max_steps_exceeded'}]},{type:'stop',reason:'max_steps_exceeded'}));
}
module.exports={TERMINAL,classifyError,runUntilStop,hasCompletedKey};
