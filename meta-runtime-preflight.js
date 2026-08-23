const axios = require('axios');
const { APPROVAL_TOKEN, buildPausedReservationDraft, discoverInstagramReelAssets } = require('./meta-paused-draft');
const { runMetaRealPreflight } = require('./meta-real-preflight');

const DEFAULT_REEL='https://www.instagram.com/reel/C9M7_b6MayR/';
const DEFAULT_USERNAME='parma.divinibenedetti';
const DEFAULT_LATITUDE=52.499492;
const DEFAULT_LONGITUDE=13.4399793;

function normalizeAccountId(value){const text=String(value||'').trim();if(/^act_\d{1,30}$/.test(text))return text;if(/^\d{1,30}$/.test(text))return `act_${text}`;return null;}
function parseFutureStart(value,now=Date.now()){const date=new Date(String(value||''));if(Number.isNaN(date.getTime())||date.getTime()<=now+15*60*1000)return null;return date.toISOString();}
function cleanError(error){const graph=error?.response?.data?.error||{};return {message:String(graph.message||error?.message||'meta_preflight_failed').replace(/\b\d{8,}\b/g,'[REDACTED_ID]').slice(0,180),type:graph.type||null,code:graph.code||null,subcode:graph.error_subcode||null};}

function runtimeConfig(env=process.env){return {accessToken:env.META_ACCESS_TOKEN||null,adAccountId:normalizeAccountId(env.META_AD_ACCOUNT_ID),apiVersion:env.META_API_VERSION||'v19.0',dsaBeneficiary:env.META_AD_DSA_BENEFICIARY||null,dsaPayor:env.META_AD_DSA_PAYOR||null,writeGateEnabled:env.META_PAUSED_DRAFT_WRITES_ENABLED==='true'};}

function createReadTransport({accessToken,apiVersion='v19.0',client=axios}){
 const http=client.create?client.create({baseURL:`https://graph.facebook.com/${apiVersion}`,timeout:20000}):client;
 return {async get(endpoint,params={}){const response=await http.get(endpoint,{params:{...params,access_token:accessToken}});return response.data;}};
}

async function executeRuntimeMetaPreflight({env=process.env,startsAt,httpClient=axios}={}){
 const config=runtimeConfig(env);
 const missing=[];if(!config.accessToken)missing.push('META_ACCESS_TOKEN');if(!config.adAccountId)missing.push('META_AD_ACCOUNT_ID');if(!config.dsaBeneficiary)missing.push('META_AD_DSA_BENEFICIARY');if(!config.dsaPayor)missing.push('META_AD_DSA_PAYOR');
 if(missing.length)return {success:false,mode:'read_only',ready:false,blockers:['configuration_incomplete'],missing_variables:missing,write_operation_performed:false,may_activate:false,may_spend:false};
 const start=parseFutureStart(startsAt);if(!start)return {success:false,mode:'read_only',ready:false,blockers:['invalid_start_time'],write_operation_performed:false,may_activate:false,may_spend:false};
 const transport=createReadTransport({accessToken:config.accessToken,apiVersion:config.apiVersion,client:httpClient});
 const assets=await discoverInstagramReelAssets({transport,adAccountId:config.adAccountId,instagramUsername:DEFAULT_USERNAME,reelPermalink:DEFAULT_REEL});
 const draft=buildPausedReservationDraft({pageId:assets.page_id,instagramUserId:assets.instagram_user_id,sourceInstagramMediaId:assets.source_instagram_media_id,latitude:DEFAULT_LATITUDE,longitude:DEFAULT_LONGITUDE,dailyBudgetEur:6,durationDays:14,startsAt:start,dsaBeneficiary:config.dsaBeneficiary,dsaPayor:config.dsaPayor});
 return runMetaRealPreflight({transport,adAccountId:config.adAccountId,draft,assets,writeGateEnabled:config.writeGateEnabled,approvalTokenOk:Boolean(APPROVAL_TOKEN)});
}

function registerMetaRealPreflightRoute(app,{authorized,env=process.env,httpClient=axios}={}){
 app.get('/tools/meta/reservation-draft/real-preflight',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');
  if(typeof authorized==='function'&&!authorized(req))return res.status(401).json({success:false,error:'Unauthorized'});
  try{const result=await executeRuntimeMetaPreflight({env,startsAt:req.query?.starts_at,httpClient});return res.status(result.ready?200:409).json({...result,endpoint:'meta_real_preflight',write_operation_performed:false,activates_spend:false});}
  catch(error){return res.status(500).json({success:false,mode:'read_only',ready:false,error:cleanError(error),write_operation_performed:false,may_activate:false,may_spend:false,activates_spend:false});}
 });
}
module.exports={normalizeAccountId,parseFutureStart,cleanError,runtimeConfig,createReadTransport,executeRuntimeMetaPreflight,registerMetaRealPreflightRoute};
