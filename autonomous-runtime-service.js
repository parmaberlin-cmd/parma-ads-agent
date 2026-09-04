'use strict';

const express = require('express');
const { AutonomousRuntime, statePath, storageStatus, readState } = require('./autonomous-runtime');
const { autonomyPolicySummary } = require('./autonomy-policy');
const { authorize:authorizeIngress, verify:verifyIngress, summary:ingressSummary } = require('./objective-ingress-auth');
const { readCampaign } = require('./google-ads-specialist-read');
const { proposeChanges } = require('./google-ads-specialist-propose');
const { buildExecutionDryRun } = require('./google-ads-specialist-execution');
const { resolveStandingAuthorizations, summary:standingDelegationSummary } = require('./standing-delegation-policy');
const { executeAuthorized } = require('./google-ads-controlled-gateway');
const { planNext } = require('./autonomous-cycle-planner');
const { spawnTasks } = require('./runtime-task-spawner');

function firstDone(objective,kind){return objective?.tasks.find(x=>x.kind===kind&&x.status==='DONE')||null;}
function localHandlers(env=process.env){
  return {
    run_diagnostics: async () => ({ validated:true, evidence:{ component:'autonomous_runtime', storage:storageStatus(env), delegation_policy:autonomyPolicySummary(), standing_delegation:standingDelegationSummary(), kill_switch_supported:true } }),
    'google_ads.read_campaign': async ({task}) => {
      const campaignId=String(task.input?.campaign_id||task.id||'').replace(/^campaign-/, '').replace(/^cycle-(?:read|observe)-/, '');
      return readCampaign({campaignId,start:task.input?.start,end:task.input?.end,env});
    },
    'google_ads.propose_changes': async ({objective_id,task}) => {
      const state=readState(statePath(env));
      const objective=state.objectives.find(x=>x.id===objective_id);
      const source=firstDone(objective,'google_ads.read_campaign')?.evidence?.[0]||null;
      return proposeChanges({readEvidence:source,context:task.input?.context||{}});
    },
    'google_ads.execution_preflight': async ({objective_id,task}) => {
      const state=readState(statePath(env));
      const objective=state.objectives.find(x=>x.id===objective_id);
      const readTask=firstDone(objective,'google_ads.read_campaign');
      const proposalTask=firstDone(objective,'google_ads.propose_changes');
      const proposal=proposalTask?.evidence?.[0]||null;
      const historicalKeys=state.objectives.flatMap(o=>o.tasks.filter(t=>t.kind==='google_ads.execution_preflight'&&t.status==='DONE').flatMap(t=>t.evidence||[])).map(e=>e?.execution_key).filter(Boolean);
      const trustedInput={...task.input,authorizations:resolveStandingAuthorizations(proposal?.actions||[],{now:Date.now()})};
      return buildExecutionDryRun({proposal,readEvidence:readTask?.evidence?.[0]||null,proposalCompletedAt:proposalTask?.completed_at||null,taskInput:trustedInput,killSwitch:state.runner.kill_switch===true,now:Date.now(),executionLedger:historicalKeys});
    },
    'google_ads.execute_authorized': async ({objective_id,task}) => {
      const state=readState(statePath(env));
      const objective=state.objectives.find(x=>x.id===objective_id);
      const preflight=firstDone(objective,'google_ads.execution_preflight')?.evidence?.[0]||null;
      const historicalKeys=state.objectives.flatMap(o=>o.tasks.filter(t=>t.kind==='google_ads.execute_authorized'&&t.status==='DONE').flatMap(t=>t.evidence||[])).flatMap(e=>(e?.executed||[]).map(x=>x.execution_key)).filter(Boolean);
      return executeAuthorized({preflight,mode:task.input?.mode==='live'?'live':'verify_only',env,killSwitch:state.runner.kill_switch===true,now:Date.now(),historicalKeys});
    },
    'google_ads.cycle_plan': async ({objective_id,task}) => {
      const state=readState(statePath(env));
      const objective=state.objectives.find(x=>x.id===objective_id);
      const result=planNext(objective,{campaignId:task.input?.campaign_id});
      if(result.validated===true&&Array.isArray(result.next_tasks)&&result.next_tasks.length){const spawned=spawnTasks({objectiveId:objective_id,tasks:result.next_tasks,env,now:Date.now()});result.evidence={...result.evidence,spawned};}
      delete result.next_tasks;return result;
    },
    generate_report: async ({objective_id,task}) => {
      const state=readState(statePath(env));
      const objective=state.objectives.find(x=>x.id===objective_id);
      const controlled=firstDone(objective,'google_ads.execute_authorized')?.evidence?.[0]||null;
      if(controlled){
        return {validated:true,evidence:{report:'google_ads_controlled_execution_summary',schema:'google_ads.controlled_execution.report.v1',objective_id,task_id:task.id,mode:controlled.mode,status:controlled.status,counts:controlled.counts,executed:controlled.executed,needs_human:controlled.needs_human,rejected:controlled.rejected,mutations_executed:Number(controlled.mutations_executed||0),standing_delegation_enforced:true}};
      }
      const execution=firstDone(objective,'google_ads.execution_preflight')?.evidence?.[0]||null;
      if(execution){
        return {validated:true,evidence:{report:'google_ads_execution_preflight_summary',schema:'google_ads.execution_preflight.report.v1',objective_id,task_id:task.id,mode:'dry_run',execution_key:execution.execution_key,replayed:execution.replayed===true,counts:execution.counts,budget_cage:execution.budget_cage,rollback_readiness:execution.rollback_readiness,actions:(execution.actions||[]).map(a=>({action_id:a.action_id,action_type:a.action_type,status:a.status,reason:a.reason,executor_supported:a.executor_supported===true,rollback_ready:a.rollback_ready===true})),mutations_executed:0,writes_allowed:false,execution_allowed:false,spend_allowed:false}};
      }
      const proposal=firstDone(objective,'google_ads.propose_changes')?.evidence?.[0]||null;
      if(proposal){
        return {validated:true,evidence:{report:'google_ads_change_plan_summary',schema:'google_ads.propose_changes.report.v1',objective_id,task_id:task.id,campaign_id:proposal.campaign_id,evidence_fingerprint:proposal.evidence_fingerprint,counts:proposal.counts,budget_cage:proposal.budget_cage,principal_actions:proposal.actions.slice(0,8).map(a=>({action_id:a.action_id,action_type:a.action_type,target:a.target,status:a.status,risk_level:a.risk_level,confidence:a.confidence,conversion_signal_used:a.conversion_signal_used})),mutations_executed:0,writes_allowed:false,execution_allowed:false,spend_allowed:false}};
      }
      const source=firstDone(objective,'google_ads.read_campaign')?.evidence?.[0]||null;
      const o=source?.overview;
      const evidence=source?{report:'google_ads_campaign_read_summary',schema:'google_ads.read_campaign.report.v1',objective_id,task_id:task.id,campaign_id:source.campaign_id,date_range:source.date_range,campaign:{status:o?.status||null,daily_budget_eur:Number(o?.daily_budget_eur||0),impressions:Number(o?.impressions||0),clicks:Number(o?.clicks||0),cost_eur:Number(o?.cost_eur||0),ctr:Number(o?.ctr||0),avg_cpc_eur:Number(o?.avg_cpc_eur||0),conversions_raw:Number(o?.conversions||0),conversion_value_raw:Number(o?.conversion_value||0)},availability:{search_terms:Array.isArray(source.search_terms),keyword_summary:Array.isArray(source.keyword_summary),ad_group_summary:Array.isArray(source.ad_group_summary),hourly_distribution:Array.isArray(source.hourly_distribution),device_distribution:Array.isArray(source.device_distribution)},conversion_metrics_interpretation:'raw_reported_values_only',writes_allowed:false,execution_allowed:false,spend_allowed:false}:{report:'runtime_execution_audit',objective_id,task_id:task.id,attempts:task.attempts,structured:true};
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
  app.get('/tools/agent/objectives/status',async(req,res)=>{if(!authorized?.(req)&&!(await oidcReadable(req)))return res.status(401).json({success:false,error:'Unauthorized'});return res.json({success:true,...runtime.snapshot(),ingress:ingressSummary(),standing_delegation:standingDelegationSummary()});});
  app.post('/tools/agent/objectives',parseJson,(req,res)=>{if(!authorized?.(req))return res.status(401).json({success:false,error:'Unauthorized'});const body=req.body||{};if(!String(body.objective||'').trim()||!Array.isArray(body.tasks)||body.tasks.length===0)return res.status(400).json({success:false,error:'objective_and_tasks_required'});const objective=runtime.submit({objective:body.objective,tasks:body.tasks});return res.status(202).json({success:true,objective_id:objective.id,status:objective.status,task_count:objective.tasks.length});});
  app.post('/internal/objective-ingress',parseJson,async(req,res)=>{const body=req.body||{};if(!validObjective(body))return res.status(400).json({success:false,error:'id_objective_and_tasks_required'});const gate=await authorizeIngress(req,body,{consume:true});if(!gate.ok)return res.status(gate.status||401).json({success:false,error:gate.error});if(gate.idempotent)return res.status(200).json({success:true,objective_id:body.id,status:'EXISTING',idempotent:true});const objective=runtime.submit({id:body.id,objective:body.objective,tasks:body.tasks});return res.status(202).json({success:true,objective_id:objective.id,status:objective.status,task_count:objective.tasks.length,issuer:'github-actions-oidc'});});
  app.post('/tools/agent/objectives/kill-switch',parseJson,(req,res)=>{if(!authorized?.(req))return res.status(401).json({success:false,error:'Unauthorized'});if(typeof req.body?.active!=='boolean')return res.status(400).json({success:false,error:'boolean_active_required'});runtime.setKillSwitch(req.body.active);return res.json({success:true,active:req.body.active});});
}
function startAutonomousRuntime(){runtime.start();return runtime;}
module.exports={runtime,registerAutonomousRuntimeRoutes,startAutonomousRuntime,localHandlers};
