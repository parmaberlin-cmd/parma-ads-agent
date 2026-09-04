'use strict';

const crypto=require('node:crypto');
const {buildBudgetMutation}=require('./google-controlled-executor');
const {PROTECTED,validCandidate}=require('./google-controlled-negative');

const MAX_PROPOSAL_AGE_MS=5*60*1000;
const CAP_EUR=10;
const RED_TYPES=new Set(['primary_conversion_change','tracking_semantic_change','conversion_action_change']);
const ROLLBACK_REQUIRED=new Set(['budget_adjustment','negative_keyword_addition','match_type_adjustment','rsa_assets_improvement','late_night_schedule_adjustment','geographic_refinement']);
const WRITE_TYPES=new Set([...ROLLBACK_REQUIRED]);
const SUPPORTED_EXECUTOR_TYPES=new Set(['budget_adjustment','negative_keyword_addition']);

function stable(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function reject(reason,extra={}){return {status:'REJECTED',reason,...extra};}
function needsHuman(reason,extra={}){return {status:'NEEDS_HUMAN',reason,...extra};}
function auto(reason,extra={}){return {status:'AUTO_EXECUTABLE',reason,...extra};}
function hasPersistedAuthorization(action,input={}){
  const rows=Array.isArray(input.authorizations)?input.authorizations:[];
  return rows.some(a=>a&&a.persisted===true&&a.action_id===action.action_id&&a.campaign_id===action.campaign_id&&a.scope===action.action_type&&(!a.expires_at||Date.parse(a.expires_at)>Date.now()));
}
function actionInProposal(action,proposal){return Array.isArray(proposal?.actions)&&proposal.actions.some(a=>stable(a)===stable(action));}
function safeCampaign(action,proposal,readEvidence){return action.campaign_id===proposal.campaign_id&&action.campaign_id===readEvidence.campaign_id;}
function budgetCheck(action,proposal){
  const cage=proposal?.budget_cage;
  if(!cage||cage.cap_eur!==CAP_EUR||cage.validated!==true)return {ok:false,reason:'budget_cage_missing_or_invalid'};
  if(Number(cage.before_total_eur)>CAP_EUR||Number(cage.proposed_total_eur)>CAP_EUR)return {ok:false,reason:'budget_cap_exceeded'};
  if(action.action_type==='budget_adjustment'){
    const next=Number(action.proposed_value?.daily_budget_eur);
    const before=Number(action.current_value?.daily_budget_eur);
    const projected=Number(cage.before_total_eur)-before+next;
    if(!Number.isFinite(projected)||projected>CAP_EUR)return {ok:false,reason:'budget_cap_exceeded'};
  }
  return {ok:true,before_total_eur:Number(cage.before_total_eur),proposed_total_eur:Number(cage.proposed_total_eur),cap_eur:CAP_EUR,hard_daily_cost_cap:false};
}
function rollbackCheck(action){return !ROLLBACK_REQUIRED.has(action.action_type)||action.rollback_possible===true;}
function negativeGuard(action){
  if(action.action_type!=='negative_keyword_addition')return {ok:true};
  const term=String(action.proposed_value?.term||'');
  const match=String(action.proposed_value?.match_type||'');
  if(match!=='EXACT')return {ok:false,reason:'negative_must_be_exact_for_existing_executor'};
  if(PROTECTED.test(term))return {ok:false,reason:'protected_local_intent'};
  return {ok:true};
}
function buildExecutorPreview(action,readEvidence){
  if(action.action_type==='budget_adjustment'){
    const budget=readEvidence.account_budget_context?.enabled_budgets?.find(b=>(b.campaign_ids||[]).includes(action.campaign_id));
    if(!budget)return {supported:false,reason:'budget_resource_missing'};
    const proposal={customer_id:'7376153998',action:{type:'set_daily_budget',campaign_id:action.campaign_id,amount_micros:Math.round(Number(action.proposed_value.daily_budget_eur)*1e6)},before:{budget_id:String(budget.budget_id),daily_budget_micros:Math.round(Number(action.current_value.daily_budget_eur)*1e6)}};
    return {supported:true,executor:'google-controlled-executor',provider_operation:buildBudgetMutation(proposal),rollback:{type:'set_daily_budget',campaign_id:action.campaign_id,amount_micros:proposal.before.daily_budget_micros}};
  }
  if(action.action_type==='negative_keyword_addition'){
    const c={campaign_id:action.campaign_id,text:String(action.proposed_value?.term||''),match_type:String(action.proposed_value?.match_type||''),semantic_class:'verified_other_restaurant',evidence_url:'https://example.invalid/evidence'};
    if(!validCandidate(c))return {supported:false,reason:'existing_negative_executor_candidate_contract_not_met'};
    return {supported:true,executor:'google-controlled-negative',provider_operation:{type:'create',campaign_id:c.campaign_id,text:c.text,match_type:'EXACT'},rollback:{type:'remove_exact_negative',resource_name:'assigned_after_write'}};
  }
  return {supported:false,reason:'executor_not_available_for_action_type'};
}
function simulateReadAfterWrite(preview,{simulateReadAfterWriteFailure=false}={}){
  if(!preview.supported)return {required:false,ready:false,reason:preview.reason};
  if(simulateReadAfterWriteFailure)return {required:true,ready:false,reason:'read_after_write_failure_simulated'};
  return {required:true,ready:true,verification:'existing_executor_read_after_write_contract'};
}
function preflightAction(action,{proposal,readEvidence,proposalCompletedAt,taskInput={},killSwitch=false,now=Date.now()}={}){
  if(killSwitch)return reject('kill_switch_active');
  if(!proposal||proposal.mode!=='proposal_only')return reject('proposal_required');
  const completed=Date.parse(proposalCompletedAt||'');
  if(!Number.isFinite(completed)||now-completed<0||now-completed>MAX_PROPOSAL_AGE_MS)return reject('proposal_stale_or_future');
  if(!actionInProposal(action,proposal))return reject('action_not_in_proposal');
  if(!safeCampaign(action,proposal,readEvidence||{}))return reject('campaign_account_mismatch');
  if(RED_TYPES.has(action.action_type)||action.delegation_class==='conversion_write')return reject('red_action_forbidden');
  if(action.action_type==='primary_conversion_change'||/primary.?conversion/i.test(String(action.target||'')))return reject('primary_conversion_change_forbidden');
  if(/tracking|conversion semantic/i.test(String(action.target||'')))return reject('tracking_semantic_change_forbidden');
  const budget=budgetCheck(action,proposal);if(!budget.ok)return reject(budget.reason,{budget_cage:budget});
  if(!rollbackCheck(action))return reject('rollback_required_missing');
  const neg=negativeGuard(action);if(!neg.ok)return reject(neg.reason);
  if(!action.evidence_refs?.length)return reject('evidence_insufficient');
  const preview=buildExecutorPreview(action,readEvidence);
  const raw=simulateReadAfterWrite(preview,taskInput);
  if(taskInput.simulateReadAfterWriteFailure&&preview.supported)return reject(raw.reason,{executor_preview:preview,read_after_write:raw});
  if(action.status==='NEEDS_HUMAN'&&!hasPersistedAuthorization(action,taskInput))return needsHuman('persisted_authorization_required',{executor_supported:preview.supported,executor_preview:preview,budget_cage:budget,rollback_ready:rollbackCheck(action),read_after_write:raw});
  if(action.status==='REJECTED')return reject('proposal_action_rejected');
  if(action.status==='AUTO_EXECUTABLE')return auto('dry_run_safe_non_mutating_action',{executor_supported:preview.supported,executor_preview:preview,budget_cage:budget,rollback_ready:rollbackCheck(action),read_after_write:raw});
  if(WRITE_TYPES.has(action.action_type)&&!preview.supported)return needsHuman('executor_not_available_for_action_type',{executor_supported:false,budget_cage:budget,rollback_ready:rollbackCheck(action)});
  return auto('authorized_for_future_executor_preflight',{executor_supported:preview.supported,executor_preview:preview,budget_cage:budget,rollback_ready:rollbackCheck(action),read_after_write:raw});
}
function buildExecutionDryRun({proposal,readEvidence,proposalCompletedAt,taskInput={},killSwitch=false,now=Date.now(),executionLedger=[]}={}){
  if(!proposal||!readEvidence)return {validated:false,correctable:false,evidence:{schema:'google_ads.execution_preflight.v1',mode:'dry_run',mutations_executed:0,blockers:['proposal_and_live_evidence_required']}};
  const executionKey=stable({proposal_fingerprint:proposal.evidence_fingerprint,proposalCompletedAt,actions:proposal.actions?.map(a=>a.action_id)});
  if((executionLedger||[]).includes(executionKey))return {validated:true,evidence:{schema:'google_ads.execution_preflight.v1',mode:'dry_run',execution_key:executionKey,replayed:true,mutations_executed:0,counts:{AUTO_EXECUTABLE:0,NEEDS_HUMAN:0,REJECTED:0},actions:[]}};
  const actions=(proposal.actions||[]).map(action=>({action_id:action.action_id,campaign_id:action.campaign_id,action_type:action.action_type,...preflightAction(action,{proposal,readEvidence,proposalCompletedAt,taskInput,killSwitch,now})}));
  const counts={AUTO_EXECUTABLE:actions.filter(a=>a.status==='AUTO_EXECUTABLE').length,NEEDS_HUMAN:actions.filter(a=>a.status==='NEEDS_HUMAN').length,REJECTED:actions.filter(a=>a.status==='REJECTED').length};
  const cage=budgetCheck({action_type:'none'},proposal);
  return {validated:true,evidence:{schema:'google_ads.execution_preflight.v1',mode:'dry_run',execution_key:executionKey,replayed:false,proposal_fingerprint:proposal.evidence_fingerprint,proposal_age_ms:now-Date.parse(proposalCompletedAt),budget_cage:cage,counts,actions,rollback_readiness:actions.map(a=>({action_id:a.action_id,ready:a.rollback_ready===true||a.status==='AUTO_EXECUTABLE'&&a.action_type==='protect_high_intent_local_terms'})),mutations_executed:0,writes_allowed:false,execution_allowed:false,spend_allowed:false,provider_validate_only_called:false,provider_write_called:false}};
}
module.exports={MAX_PROPOSAL_AGE_MS,CAP_EUR,preflightAction,buildExecutionDryRun,buildExecutorPreview,simulateReadAfterWrite};
