'use strict';

const crypto=require('node:crypto');
const {resolveStandingAuthorization}=require('./standing-delegation-policy');
const {runControlledNegativeJob}=require('./google-controlled-negative');

const NON_MUTATING_ACTIONS=new Set(['protect_high_intent_local_terms']);
function stable(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function executeKey(preflight,action){return stable({execution_key:preflight.execution_key,action_id:action.action_id,campaign_id:action.campaign_id,action_type:action.action_type});}

async function executeAuthorized({preflight,mode='verify_only',env=process.env,killSwitch=false,now=Date.now(),historicalKeys=[]}={}){
  if(!preflight||preflight.schema!=='google_ads.execution_preflight.v1')return {validated:false,correctable:false,evidence:{schema:'google_ads.controlled_execution.v1',blockers:['fresh_preflight_required'],mutations_executed:0}};
  if(!['verify_only','live'].includes(mode))return {validated:false,correctable:false,evidence:{schema:'google_ads.controlled_execution.v1',blockers:['invalid_execution_mode'],mutations_executed:0}};
  if(killSwitch)return {validated:true,evidence:{schema:'google_ads.controlled_execution.v1',mode,status:'BLOCKED_EXTERNAL',reason:'kill_switch_active',mutations_executed:0,executed:[],needs_human:[],rejected:[]}};
  const executed=[],needsHuman=[],rejected=[];
  for(const action of preflight.actions||[]){
    const key=executeKey(preflight,action);
    if(historicalKeys.includes(key)){executed.push({action_id:action.action_id,execution_key:key,status:'IDEMPOTENT_REPLAY',mutations_executed:0});continue;}
    if(action.status==='REJECTED'){rejected.push({action_id:action.action_id,reason:action.reason});continue;}
    if(action.status==='NEEDS_HUMAN'){needsHuman.push({action_id:action.action_id,reason:action.reason});continue;}
    if(action.status!=='AUTO_EXECUTABLE'){rejected.push({action_id:action.action_id,reason:'unsupported_preflight_status'});continue;}
    if(NON_MUTATING_ACTIONS.has(action.action_type)){
      executed.push({action_id:action.action_id,execution_key:key,status:'APPLIED_INTERNAL_GUARDRAIL',provider_write:false,mutations_executed:0});
      continue;
    }
    const standing=resolveStandingAuthorization(action,{now});
    if(!standing){needsHuman.push({action_id:action.action_id,reason:'standing_delegation_required'});continue;}
    if(mode!=='live'){
      executed.push({action_id:action.action_id,execution_key:key,status:'DELEGATED_EXECUTION_VERIFIED',authorization_id:standing.authorization_id,provider_write:false,mutations_executed:0});
      continue;
    }
    if(action.action_type!=='negative_keyword_addition'){needsHuman.push({action_id:action.action_id,reason:'live_executor_not_allowlisted'});continue;}
    // Reuse the existing bounded executor. Its own mandate, kill switch, budget cage,
    // evidence reads, validate-only, durable ledger, idempotency, RAW and rollback remain authoritative.
    const result=await runControlledNegativeJob({env,now:()=>now});
    executed.push({action_id:action.action_id,execution_key:key,status:result.status,authorization_id:standing.authorization_id,provider_write:result.writes_executed===true,mutations_executed:result.writes_executed===true?1:0});
  }
  const mutations=executed.reduce((n,x)=>n+Number(x.mutations_executed||0),0);
  return {validated:true,evidence:{schema:'google_ads.controlled_execution.v1',mode,status:needsHuman.length?'PARTIAL_NEEDS_HUMAN':'DONE',preflight_execution_key:preflight.execution_key,executed,needs_human:needsHuman,rejected,counts:{executed:executed.length,needs_human:needsHuman.length,rejected:rejected.length},mutations_executed:mutations,writes_allowed:mode==='live',standing_delegation_enforced:true,kill_switch_checked:true}};
}
module.exports={NON_MUTATING_ACTIONS,executeKey,executeAuthorized};
