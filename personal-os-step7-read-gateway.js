'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const { collectCampaignOverview }=require('./google-campaign-breakdowns');
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CAMPAIGN_ID=/^\d{1,20}$/;
const STEP7_ALLOWED_CAMPAIGNS=new Set(['23276824770']);
const MAX_SKEW_MS=5*60*1000;
function fail(reason){const e=new Error(reason);e.reason=reason;throw e;}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function requestMessage(e){return ['personal-os-step7-read-v1',e.executor_id,e.key_id,e.issued_at,e.nonce,e.body_sha256].join('\n');}
function responseMessage(e){return ['personal-os-step7-read-result-v1',e.executor_id,e.key_id,e.issued_at,e.nonce,e.request_nonce,e.request_id,e.body_sha256].join('\n');}
function stateRoot(env){const base=env.PERSONAL_OS_STEP3_STATE_PATH||env.RAILWAY_VOLUME_MOUNT_PATH;if(typeof base!=='string'||!path.isAbsolute(base))fail('step7_state_path_unavailable');return env.PERSONAL_OS_STEP3_STATE_PATH?path.join(base,'step7-read-gateway'):path.join(base,'personal-os-step7-read-gateway');}
function consumeNonce(root,executorId,keyId,nonce){const file=path.join(root,'nonces',digest({executorId,keyId,nonce})+'.json');fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});try{fs.writeFileSync(file,JSON.stringify({consumed_at:new Date().toISOString()})+'\n',{mode:0o600,flag:'wx'});}catch(e){if(e?.code==='EEXIST')fail('step7_replayed_nonce');fail('step7_nonce_store_failed_closed');}}
function validateRequest(input,env=process.env,nowMs=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('step7_invalid_request');
 const expected=['body','body_sha256','executor_id','issued_at','key_id','nonce','schema_version','signature'].sort();
 if(JSON.stringify(Object.keys(input).sort())!==JSON.stringify(expected))fail('step7_invalid_request');
 if(input.schema_version!=='personal_os.step7_read_request_envelope.v1')fail('step7_unsupported_schema');
 for(const k of ['executor_id','key_id','nonce'])if(!ID.test(input[k]||''))fail('step7_invalid_identity');
 if(input.executor_id!==env.PERSONAL_OS_STEP3_MAC_EXECUTOR_ID||input.key_id!==env.PERSONAL_OS_STEP3_MAC_KEY_ID)fail('step7_unknown_executor');
 if(typeof input.issued_at!=='string'||Number.isNaN(Date.parse(input.issued_at))||Math.abs(nowMs-Date.parse(input.issued_at))>MAX_SKEW_MS)fail('step7_stale_request');
 const body=input.body;if(!body||Object.keys(body).sort().join(',')!=='campaign_id,operation,request_id')fail('step7_invalid_body');
 if(body.operation!=='google_ads.read'||!ID.test(body.request_id||'')||!CAMPAIGN_ID.test(String(body.campaign_id||'')))fail('step7_operation_not_allowed');
 if(!STEP7_ALLOWED_CAMPAIGNS.has(String(body.campaign_id)))fail('step7_campaign_not_allowed');
 if(digest(body)!==input.body_sha256)fail('step7_body_digest_mismatch');
 const pem=env.PERSONAL_OS_STEP3_MAC_PUBLIC_KEY_PEM;if(typeof pem!=='string'||pem.includes('PRIVATE KEY'))fail('step7_public_key_unavailable');
 let ok=false;try{ok=crypto.verify(null,Buffer.from(requestMessage(input)),pem,Buffer.from(input.signature||'','base64'));}catch{}if(!ok)fail('step7_signature_invalid');
 consumeNonce(stateRoot(env),input.executor_id,input.key_id,input.nonce);return body;
}
function signResult(body,env=process.env,options={}){const privateKey=env.PERSONAL_OS_STEP3_TASK_SIGNING_PRIVATE_KEY_PEM;if(typeof privateKey!=='string'||!privateKey.includes('PRIVATE KEY'))fail('step7_signing_key_unavailable');const e={schema_version:'personal_os.step7_read_result_envelope.v1',executor_id:env.PERSONAL_OS_STEP3_EXECUTOR_ID,key_id:env.PERSONAL_OS_STEP3_TASK_KEY_ID,issued_at:options.issuedAt||new Date().toISOString(),nonce:options.nonce||crypto.randomUUID(),request_nonce:options.requestNonce||null,request_id:body.request_id,body_sha256:digest(body),signature:'',body};e.signature=crypto.sign(null,Buffer.from(responseMessage(e)),privateKey).toString('base64');return e;}
function summarize(rows,campaignId){const totals=(rows||[]).reduce((a,r)=>({impressions:a.impressions+Number(r.metrics?.impressions||0),clicks:a.clicks+Number(r.metrics?.clicks||0),cost_micros:a.cost_micros+Number(r.metrics?.cost_micros||0)}),{impressions:0,clicks:0,cost_micros:0});return {campaign_id:String(campaignId),impressions:totals.impressions,clicks:totals.clicks,cost_eur:totals.cost_micros/1e6};}
async function executeRead(body,{getGoogleCustomer,getGoogleDateRange,googleTimezone}){const customer=getGoogleCustomer();const {start,end}=getGoogleDateRange({days:1,readMode:'historical',timezone:googleTimezone()});const rows=await collectCampaignOverview({customer,campaignId:String(body.campaign_id),start,end});return {schema_version:'personal_os.step7_read_result.v1',request_id:body.request_id,status:'COMPLETED',operation:'google_ads.read',source:'google_ads',read_back:'PASS',data:summarize(rows,body.campaign_id),authority_granted:false,provider_write_performed:false,credentials_read:false,spend_changed:false,published:false};}
function installStep7ReadGateway({app,env=process.env,getGoogleCustomer,getGoogleDateRange,googleTimezone}){app.post('/control/personal-os/read-gateway',async(req,res)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});try{const body=validateRequest(req.body,env);const result=await executeRead(body,{getGoogleCustomer,getGoogleDateRange,googleTimezone});return res.status(200).json(signResult(result,env,{requestNonce:req.body.nonce}));}catch(e){const safe=new Set(['step7_invalid_request','step7_unsupported_schema','step7_invalid_identity','step7_unknown_executor','step7_stale_request','step7_invalid_body','step7_operation_not_allowed','step7_campaign_not_allowed','step7_body_digest_mismatch','step7_public_key_unavailable','step7_signature_invalid','step7_replayed_nonce','step7_nonce_store_failed_closed','step7_state_path_unavailable','step7_signing_key_unavailable']);const reason=safe.has(e?.reason)?e.reason:'step7_read_failed';return res.status(reason==='step7_read_failed'?503:400).json({success:false,status:'BLOCKED',reason,authority_granted:false,provider_writes:0,spend_changed:false,published:false});}});}
module.exports={installStep7ReadGateway,validateRequest,signResult,requestMessage,responseMessage,digest};
