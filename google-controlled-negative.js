'use strict';
const fs=require('node:fs');
const {createHash,createHmac}=require('node:crypto');
const {customerFrom,readBudgetInventory,validateInventory}=require('./google-write-path');
const {ExecutionLedger}=require('./google-controlled-executor');
const {createNegativeRestAdapter}=require('./google-negative-rest-adapter');
const CUSTOMER='7376153998';
const MANDATE=Object.freeze({id:'philippe-2026-09-04-exact-negatives-5',expires_at:'2026-09-04T21:59:59.000Z',max_actions:5});
const CANDIDATES=Object.freeze([{campaign_id:'23853417314',text:'sly restaurant berlin',match_type:'EXACT',evidence_start:'2026-09-03',evidence_end:'2026-09-04',semantic_class:'verified_other_restaurant',evidence_url:'https://www.sly-berlin.com/en/dine-drink'}]);
const PROTECTED=/\b(near me|in meiner nähe|in der nähe|kreuzberg|wrangel|parma|pizza|pizzeria)\b/i;
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const norm=v=>String(v||'').trim().toLocaleLowerCase('de-DE');
function validCandidate(c){return c&&/^\d{1,20}$/.test(c.campaign_id)&&c.match_type==='EXACT'&&typeof c.text==='string'&&c.text===c.text.trim()&&c.text.length>0&&c.text.length<=80&&!PROTECTED.test(c.text)&&c.semantic_class==='verified_other_restaurant'&&/^https:\/\//.test(c.evidence_url);}
function cleanBudget(rows){return rows.map(r=>({campaign_id:r.campaign_id,status:r.status,amount_micros:r.amount_micros,budget_resource_name:r.budget_resource_name,explicitly_shared:r.explicitly_shared})).sort((a,b)=>a.campaign_id.localeCompare(b.campaign_id));}
async function searchEvidence(customer,c){
 const rows=await customer.query(`SELECT campaign.id, search_term_view.search_term, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros FROM search_term_view WHERE campaign.id = ${c.campaign_id} AND segments.date BETWEEN '${c.evidence_start}' AND '${c.evidence_end}'`);
 const hits=(rows||[]).filter(r=>norm(r.search_term_view?.search_term)===norm(c.text)).map(r=>({date:String(r.segments?.date||''),impressions:Number(r.metrics?.impressions||0),clicks:Number(r.metrics?.clicks||0),cost_micros:Number(r.metrics?.cost_micros||0)}));
 if(!hits.length||hits.some(x=>!/^2026-09-0[34]$/.test(x.date)||![x.impressions,x.clicks,x.cost_micros].every(Number.isSafeInteger)))throw Error('live_search_term_evidence_missing');
 return hits;
}
async function readExactNegatives(customer,c){
 const campaign=await customer.query(`SELECT campaign_criterion.resource_name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id = ${c.campaign_id} AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE AND campaign_criterion.status != 'REMOVED' LIMIT 10000`);
 const adgroup=await customer.query(`SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE campaign.id = ${c.campaign_id} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = TRUE AND ad_group_criterion.status != 'REMOVED' LIMIT 10000`);
 const rows=[...(campaign||[]).map(r=>({scope:'CAMPAIGN',resource_name:r.campaign_criterion?.resource_name,text:r.campaign_criterion?.keyword?.text,match_type:r.campaign_criterion?.keyword?.match_type})),...(adgroup||[]).map(r=>({scope:'AD_GROUP',resource_name:r.ad_group_criterion?.resource_name,text:r.ad_group_criterion?.keyword?.text,match_type:r.ad_group_criterion?.keyword?.match_type}))];
 return rows.filter(x=>norm(x.text)===norm(c.text)).sort((a,b)=>String(a.resource_name).localeCompare(String(b.resource_name)));
}
async function readState(customer,c){
 const account=await customer.query('SELECT customer.id, customer.currency_code, customer.time_zone FROM customer');
 if(account.length!==1||String(account[0].customer?.id)!==CUSTOMER||account[0].customer?.currency_code!=='EUR'||account[0].customer?.time_zone!=='Europe/Berlin')throw Error('account_binding_failed');
 const budgets=await readBudgetInventory(customer),check=validateInventory(budgets,{maxTotalMicros:10_000_000});
 if(!check.ok)throw Error('budget_cage_failed');
 if(!budgets.some(r=>r.campaign_id===c.campaign_id&&(r.status==='ENABLED'||r.status===2)))throw Error('campaign_not_enabled');
 return {customer_id:CUSTOMER,budgets:cleanBudget(budgets),enabled_budget_micros:check.total_enabled_budget_micros,evidence:await searchEvidence(customer,c),existing:await readExactNegatives(customer,c)};
}
function executionId(c){return sha({mandate:MANDATE.id,customer_id:CUSTOMER,campaign_id:c.campaign_id,text:norm(c.text),match_type:'EXACT'});}
function stable(s){return sha(s);}
function providerResource(response,state,c){
 const named=response?.results?.[0]?.resourceName; if(named)return String(named);
 const found=state.existing.find(x=>x.scope==='CAMPAIGN'&&norm(x.text)===norm(c.text));return found?.resource_name||null;
}
async function executeOne({customer,adapter,ledger,candidate,killSwitch=async()=>false,now=Date.now}){
 if(!validCandidate(candidate))throw Error('candidate_not_authorized');
 const id=executionId(candidate);
 return ledger.exclusive(CUSTOMER,async()=>{
  const prior=ledger.read(id);if(prior)return {id,status:prior.status,replayed:true,writes_executed:false};
  if(ledger.pending(CUSTOMER))throw Error('account_reconciliation_required');
  if(await killSwitch()!==false)throw Error('kill_switch_active');
  if(now()>=Date.parse(MANDATE.expires_at))throw Error('mandate_expired');
  const before=await readState(customer,candidate);
  if(before.existing.length)return {id,status:'already_present',writes_executed:false,before};
  const operation={type:'create',campaign_id:candidate.campaign_id,text:candidate.text,match_type:'EXACT'};
  await adapter.mutate(operation,{validate_only:true});
  if(await killSwitch()!==false)throw Error('kill_switch_active');
  const fresh=await readState(customer,candidate);
  if(stable(fresh)!==stable(before))throw Error('preflight_state_changed');
  const record={id,status:'sending',action:{type:'add_negative_keyword',campaign_id:candidate.campaign_id,text:candidate.text,match_type:'EXACT'},before,operation,mandate:MANDATE.id,rollback:{type:'remove_exact_negative',resource_name:null},created_at:now()};
  ledger.pending(CUSTOMER,true);ledger.write(id,record);
  if(await killSwitch()!==false){record.status='blocked';ledger.write(id,record);ledger.clearPending(CUSTOMER);throw Error('kill_switch_active');}
  try{
   const response=await adapter.mutate(operation,{validate_only:false});
   const after=await readState(customer,candidate),resource=providerResource(response,after,candidate);
   record.after=after;record.rollback.resource_name=resource;record.finished_at=now();
   const budgetUnchanged=stable(after.budgets)===stable(before.budgets)&&after.enabled_budget_micros===before.enabled_budget_micros;
   record.status=after.existing.some(x=>x.scope==='CAMPAIGN'&&norm(x.text)===norm(candidate.text))&&resource&&budgetUnchanged?'verified':'reconciliation_required';
   ledger.write(id,record);if(record.status==='verified')ledger.clearPending(CUSTOMER);
   return {id,status:record.status,writes_executed:true,budget_before_micros:before.enabled_budget_micros,budget_after_micros:after.enabled_budget_micros,rollback_available:record.status==='verified'};
  }catch{record.status='uncertain';record.finished_at=now();ledger.write(id,record);return{id,status:'uncertain',writes_executed:'unknown'};}
 });
}
async function rollbackOne({customer,adapter,ledger,sourceId,killSwitch=async()=>false,now=Date.now}){
 if(!/^[a-f0-9]{64}$/.test(String(sourceId||'')))throw Error('invalid_source_execution');
 return ledger.exclusive(CUSTOMER,async()=>{
  if(ledger.pending(CUSTOMER))throw Error('account_reconciliation_required');
  const source=ledger.read(sourceId);if(source?.status!=='verified'||source.mandate!==MANDATE.id||!source.rollback?.resource_name)throw Error('verified_source_required');
  if(await killSwitch()!==false||now()>=Date.parse(MANDATE.expires_at))throw Error('rollback_gate_closed');
  const candidate=CANDIDATES.find(c=>c.campaign_id===source.action.campaign_id&&norm(c.text)===norm(source.action.text));if(!candidate)throw Error('candidate_not_authorized');
  const before=await readState(customer,candidate);if(!before.existing.some(x=>x.resource_name===source.rollback.resource_name))throw Error('rollback_target_missing');
  const id=sha({mandate:MANDATE.id,rollback_of:sourceId}),prior=ledger.read(id);if(prior)return{id,status:prior.status,replayed:true,writes_executed:false};
  const operation={type:'remove',resource_name:source.rollback.resource_name};await adapter.mutate(operation,{validate_only:true});
  const fresh=await readState(customer,candidate);if(stable(fresh)!==stable(before)||await killSwitch()!==false)throw Error('rollback_preflight_changed');
  const record={id,status:'sending',rollback_of:sourceId,before,operation,mandate:MANDATE.id,created_at:now()};ledger.pending(CUSTOMER,true);ledger.write(id,record);
  try{await adapter.mutate(operation,{validate_only:false});const after=await readState(customer,candidate);record.after=after;record.finished_at=now();record.status=!after.existing.some(x=>x.resource_name===source.rollback.resource_name)&&stable(after.budgets)===stable(before.budgets)?'verified':'reconciliation_required';ledger.write(id,record);if(record.status==='verified')ledger.clearPending(CUSTOMER);return{id,status:record.status,writes_executed:true};}
  catch{record.status='uncertain';record.finished_at=now();ledger.write(id,record);return{id,status:'uncertain',writes_executed:'unknown'};}
 });
}
function durableLedger(env){
 if(!fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').some(line=>line.split(' ')[4]==='/data')||fs.realpathSync('/data')!=='/data')throw Error('durable_mount_unverified');
 if(typeof env.PARMA_AGENT_API_KEY!=='string'||!env.PARMA_AGENT_API_KEY)throw Error('audit_key_unavailable');
 const key=createHmac('sha256',env.PARMA_AGENT_API_KEY).update('parma-google-execution-v1').digest(),directory='/data/google-controlled-execution';
 try{fs.mkdirSync(directory,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}return new ExecutionLedger({directory,integrityKey:key});
}
async function runControlledNegativeJob({env=process.env,now=Date.now}={}){
 if(env.GOOGLE_CONTROLLED_NEGATIVE_JOB!=='true')return{status:'disabled',writes_executed:false};
 if(CANDIDATES.length<1||CANDIDATES.length>MANDATE.max_actions||new Set(CANDIDATES.map(c=>norm(c.text))).size!==CANDIDATES.length)return{status:'blocked',blockers:['candidate_limit_invalid'],writes_executed:false};
 if(env.GOOGLE_ADS_WRITE_KILL_SWITCH!=='false')return{status:'blocked',blockers:['kill_switch_active_or_unconfigured'],writes_executed:false};
 if(now()>=Date.parse(MANDATE.expires_at))return{status:'blocked',blockers:['mandate_expired'],writes_executed:false};
 const customer=customerFrom(env);if(customer.credentials.customer_id!==CUSTOMER)throw Error('account_mismatch');
 const adapter=createNegativeRestAdapter(customer),ledger=durableLedger(env),results=[];
 for(const candidate of CANDIDATES)results.push(await executeOne({customer,adapter,ledger,candidate,now,killSwitch:async()=>env.GOOGLE_ADS_WRITE_KILL_SWITCH!=='false'||env.GOOGLE_CONTROLLED_NEGATIVE_JOB!=='true'}));
 return{status:results.every(x=>['verified','already_present'].includes(x.status))?'verified':'blocked',mandate:MANDATE.id,max_actions:MANDATE.max_actions,results,writes_executed:results.some(x=>x.writes_executed===true)};
}
module.exports={MANDATE,CANDIDATES,PROTECTED,validCandidate,readState,executionId,executeOne,rollbackOne,runControlledNegativeJob};
