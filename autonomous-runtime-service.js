'use strict';

const express = require('express');
const { AutonomousRuntime, statePath, storageStatus } = require('./autonomous-runtime');
const { autonomyPolicySummary } = require('./autonomy-policy');
const { authorize:authorizeIngress, verify:verifyIngress, summary:ingressSummary } = require('./objective-ingress-auth');
const { readCampaign } = require('./google-ads-specialist-read');

function localHandlers(env=process.env){
  return {
    run_diagnostics: async () => ({ validated:true, evidence:{ component:'autonomous_runtime', storage:storageStatus(env), delegation_policy:autonomyPolicySummary(), kill_switch_supported:true } }),
    'google_ads.read_campaign': async ({task}) => {
      const campaignId=String(task.id||'').replace(/^campaign-/, '');
      return readCampaign({campaignId,env});
    },
    generate_report: async ({objective_id,task}) => ({ validated:true, evidence:{ report:'runtime_execution_audit', objective_id, task_id:task.id, attempts:task.attempts, structured:true } }),
  };
}

const runtime = new AutonomousRuntime({ file:statePath(process.env), env:process.env, handlers:localHandlers(process.env), tickMs:Number(process.env.AUTONOMOUS_RUNTIME_TICK_MS||2000), leaseMs:Number(process.env.AUTONOMOUS_RUNTIME_LEASE_MS||30000) });
const parseJson = express.json({limit:'64kb'});

async function oidcReadable(req){try{await verifyIngress(req);return true;}catch{return false;}}
function validObjective(body){return String(body.objective||'').trim()&&String(body.id||'').trim()&&Array.isArray(body.tasks)&&body.tasks.length>0;}

function registerAutonomousRuntimeRoutes(app,{authorized}={}){
  app.get('/health/autonomous-runner',(req,res)=>res.json({success:true,...runtime.snapshot()}));
  app.get('/tools/agent/objectives/status',async(req,res)=>{if(!authorized?.(req)&&!(await oidcReadable(req)))return res.status(401).json({success:false,error:'Unauthorized'});return res.json({success:true,...runtime.snapshot(),ingress:ingressSummary()});});
  app.post('/tools/agent/objectives',parseJson,(req,res)=>{
    if(!authorized?.(req))return res.status(401).json({success:false,error:'Unauthorized'});
    const body=req.body||{}; if(!String(body.objective||'').trim()||!Array.isArray(body.tasks)||body.tasks.length===0)return res.status(400).json({success:false,error:'objective_and_tasks_required'});
    const objective=runtime.submit({objective:body.objective,tasks:body.tasks});
    return res.status(202).json({success:true,objective_id:objective.id,status:objective.status,task_count:objective.tasks.length});
  });
  app.post('/internal/objective-ingress',parseJson,async(req,res)=>{
    const body=req.body||{}; if(!validObjective(body))return res.status(400).json({success:false,error:'id_objective_and_tasks_required'});
    const gate=await authorizeIngress(req,body,{consume:true}); if(!gate.ok)return res.status(gate.status||401).json({success:false,error:gate.error});
    if(gate.idempotent)return res.status(200).json({success:true,objective_id:body.id,status:'EXISTING',idempotent:true});
    const objective=runtime.submit({id:body.id,objective:body.objective,tasks:body.tasks});
    return res.status(202).json({success:true,objective_id:objective.id,status:objective.status,task_count:objective.tasks.length,issuer:'github-actions-oidc'});
  });
  app.post('/tools/agent/objectives/kill-switch',parseJson,(req,res)=>{
    if(!authorized?.(req))return res.status(401).json({success:false,error:'Unauthorized'});
    if(typeof req.body?.active!=='boolean')return res.status(400).json({success:false,error:'boolean_active_required'});
    runtime.setKillSwitch(req.body.active); return res.json({success:true,active:req.body.active});
  });
}

function startAutonomousRuntime(){runtime.start();return runtime;}
module.exports={runtime,registerAutonomousRuntimeRoutes,startAutonomousRuntime,localHandlers};
