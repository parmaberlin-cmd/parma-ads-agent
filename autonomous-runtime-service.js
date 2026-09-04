'use strict';

const { AutonomousRuntime, statePath, storageStatus } = require('./autonomous-runtime');
const { autonomyPolicySummary } = require('./autonomy-policy');

function localHandlers(env=process.env){
  return {
    run_diagnostics: async () => ({ validated:true, evidence:{ component:'autonomous_runtime', storage:storageStatus(env), delegation_policy:autonomyPolicySummary(), kill_switch_supported:true } }),
    generate_report: async ({objective_id,task}) => ({ validated:true, evidence:{ report:'runtime_execution_audit', objective_id, task_id:task.id, attempts:task.attempts } }),
  };
}

const runtime = new AutonomousRuntime({ file:statePath(process.env), env:process.env, handlers:localHandlers(process.env), tickMs:Number(process.env.AUTONOMOUS_RUNTIME_TICK_MS||2000), leaseMs:Number(process.env.AUTONOMOUS_RUNTIME_LEASE_MS||30000) });

function registerAutonomousRuntimeRoutes(app,{authorized}={}){
  app.get('/health/autonomous-runner',(req,res)=>res.json({success:true,...runtime.snapshot()}));
  app.get('/tools/agent/objectives/status',(req,res)=>{if(!authorized?.(req))return res.status(401).json({success:false,error:'Unauthorized'});return res.json({success:true,...runtime.snapshot()});});
  app.post('/tools/agent/objectives',(req,res)=>{
    if(!authorized?.(req))return res.status(401).json({success:false,error:'Unauthorized'});
    const body=req.body||{}; if(!String(body.objective||'').trim()||!Array.isArray(body.tasks)||body.tasks.length===0)return res.status(400).json({success:false,error:'objective_and_tasks_required'});
    const objective=runtime.submit({objective:body.objective,tasks:body.tasks});
    return res.status(202).json({success:true,objective_id:objective.id,status:objective.status,task_count:objective.tasks.length});
  });
  app.post('/tools/agent/objectives/kill-switch',(req,res)=>{
    if(!authorized?.(req))return res.status(401).json({success:false,error:'Unauthorized'});
    if(typeof req.body?.active!=='boolean')return res.status(400).json({success:false,error:'boolean_active_required'});
    runtime.setKillSwitch(req.body.active); return res.json({success:true,active:req.body.active});
  });
}

function startAutonomousRuntime(){runtime.start();return runtime;}
module.exports={runtime,registerAutonomousRuntimeRoutes,startAutonomousRuntime,localHandlers};
