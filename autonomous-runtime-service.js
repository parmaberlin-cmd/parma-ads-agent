'use strict';

const express = require('express');
const { AutonomousRuntime, statePath, storageStatus, readState } = require('./autonomous-runtime');
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
    generate_report: async ({objective_id,task}) => {
      const state=readState(statePath(env));
      const objective=state.objectives.find(x=>x.id===objective_id);
      const source=objective?.tasks.find(x=>x.kind==='google_ads.read_campaign'&&x.status==='DONE')?.evidence?.[0]||null;
      const o=source?.overview;
      const evidence=source?{
        report:'google_ads_campaign_read_summary',schema:'google_ads.read_campaign.report.v1',objective_id,task_id:task.id,campaign_id:source.campaign_id,date_range:source.date_range,
        campaign:{status:o?.status||null,daily_budget_eur:Number(o?.daily_budget_eur||0),impressions:Number(o?.impressions||0),clicks:Number(o?.clicks||0),cost_eur:Number(o?.cost_eur||0),ctr:Number(o?.ctr||0),avg_cpc_eur:Number(o?.avg_cpc_eur||0),conversions_raw:Number(o?.conversions||0),conversion_value_raw:Number(o?.conversion_value||0)},
        availability:{search_terms:Array.isArray(source.search_terms),keyword_summary:Array.isArray(source.keyword_summary),ad_group_summary:Array.isArray(source.ad_group_summary),hourly_distribution:Array.isArray(source.hourly_distribution),device_distribution:Array.isArray(source.device_distribution)},
        conversion_metrics_interpretation:'raw_reported_values_only',writes_allowed:false,execution_allowed:false,spend_allowed:false,
      }:{report:'runtime_execution_audit',objective_id,task_id:task.id,attempts:task.attempts,structured:true};
      return {validated:true,evidence};
    },
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
