'use strict';
// Internal startup/job entrypoint. Not exposed through read-only MCP or GET routes.
const fs=require('node:fs');
const {createHmac}=require('node:crypto');
const {customerFrom}=require('./google-write-path');
const {collectConfiguredInventory}=require('./google-controlled-inventory-reader');
const {ControlledProposalJournal}=require('./google-controlled-journal');
const {ExecutionLedger,createControlledExecutor}=require('./google-controlled-executor');
const {createBudgetRestAdapter}=require('./google-budget-rest-adapter');
const {prepareControlledProposal}=require('./google-controlled-proposals');
const {readToday}=require('./google-write-runtime');
const mandate=Object.freeze({id:'philippe-2026-09-04-budget10',customer_id:'7376153998',cap_micros:10000000,expires_at:'2026-09-04T21:59:59.000Z'});
async function runControlledBudgetJob({env=process.env,action=null}={}){
 if(env.GOOGLE_CONTROLLED_BUDGET_JOB!=='true')return {status:'disabled',writes_executed:false};
 if(Date.now()>=Date.parse(mandate.expires_at))return {status:'blocked',blockers:['mandate_expired'],writes_executed:false};
 if(env.GOOGLE_ADS_WRITE_KILL_SWITCH!=='false')return {status:'blocked',blockers:['kill_switch_active_or_unconfigured'],writes_executed:false};
 const customer=customerFrom(env);
 if(customer.credentials.customer_id!==mandate.customer_id)throw Error('account_mismatch');
 const readSnapshot=async()=>{
  const r=await collectConfiguredInventory({env,createCustomer:()=>customer});
  if(!r.success||r.time_zone!=='Europe/Berlin')throw Error('inventory_unavailable');
  return r.snapshot;
 };
 const snapshot=await readSnapshot();const today=await readToday(customer);
 const policy={customer_id:mandate.customer_id,campaign_ids:snapshot.campaigns.map(c=>c.campaign_id),allowed_actions:['set_daily_budget'],expires_at:mandate.expires_at,
   max_account_daily_budget_micros:mandate.cap_micros,max_campaign_daily_budget_micros:mandate.cap_micros,max_budget_change_percent:100,max_snapshot_age_seconds:60};
 const summary={mandate:mandate.id,limit_semantics:'enabled_configured_daily_budget',hard_daily_cost_cap:false,
   campaigns:snapshot.campaigns.map(c=>({campaign_id:c.campaign_id,status:c.status,daily_budget_micros:c.daily_budget_micros})),
   enabled_budget_micros:snapshot.campaigns.filter(c=>c.status==='ENABLED').reduce((n,c)=>n+c.daily_budget_micros,0),today,writes_executed:false};
 const prepared=action?prepareControlledProposal({action,policy,snapshot}):null;
 if(action&&!prepared.policy_fit)return {...summary,status:'blocked',blockers:prepared.blockers};
 // An isolated, actual volume mount is mandatory; container scratch never qualifies.
 if(!fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').some(line=>line.split(' ')[4]==='/data')||fs.realpathSync('/data')!=='/data')throw Error('durable_mount_unverified');
 if(typeof env.PARMA_AGENT_API_KEY!=='string'||!env.PARMA_AGENT_API_KEY)throw Error('audit_key_unavailable');
 const key=createHmac('sha256',env.PARMA_AGENT_API_KEY).update('parma-google-execution-v1').digest();
 const directory='/data/google-controlled-execution';
 try{fs.mkdirSync(directory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 const ledger=new ExecutionLedger({directory,integrityKey:key});
 const journal=new ControlledProposalJournal({directory:directory+'/proposals',integrityKey:key,resolveActor:()=>mandate.id});
 if(!action)return {...summary,status:'ready_for_checked_proposal',audit_storage_durable:true,increase_allowed:false,blockers:['conversion_integrity_untrusted_for_increases']};
 // Authorization comes from this deployed owner mandate, never a request-body boolean.
 const proposed=journal.propose({action,policy,snapshot});
 journal.decide({proposalId:proposed.proposal_id,expectedDigest:proposed.proposal_id,decision:'approved'});
 const executor=createControlledExecutor({journal,ledger,customer:createBudgetRestAdapter(customer),readSnapshot,readPolicy:async()=>policy,
   limitSemantics:'enabled_configured_daily_budget',killSwitch:async()=>env.GOOGLE_ADS_WRITE_KILL_SWITCH!=='false'||env.GOOGLE_CONTROLLED_BUDGET_JOB!=='true',
   readSafety:async()=>{const fresh=await readToday(customer);return {...fresh,customer_id:mandate.customer_id,limit_semantics:'enabled_configured_daily_budget',today_read_success:true,checked_at:Date.now(),proposal_id:proposed.proposal_id,audit_storage_durable:true,live_execution_gate:true};}});
 const result=await executor.execute(proposed.proposal_id);
 return {...summary,...result,audit_id:proposed.proposal_id};
}
module.exports={runControlledBudgetJob};
