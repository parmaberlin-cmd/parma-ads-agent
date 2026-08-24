const crypto=require('crypto');

const READ_ACTIONS=new Set(['runtime_status','meta_preflight','google_access','google_search_terms','google_keywords','shadow_health']);
const WRITE_ACTIONS=new Set(['meta_paused_draft']);

function safeEqual(a,b){const x=Buffer.from(String(a||''));const y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function authorizeControlPlane({providedKey,configuredKey,action,writeGateEnabled=false,approvalOk=false}={}){
 if(!configuredKey)return{allowed:false,status:503,reason:'control_plane_not_configured'};
 if(!safeEqual(providedKey,configuredKey))return{allowed:false,status:401,reason:'unauthorized'};
 if(READ_ACTIONS.has(action))return{allowed:true,status:200,mode:'read_only'};
 if(WRITE_ACTIONS.has(action)){
  if(!writeGateEnabled)return{allowed:false,status:403,reason:'write_gate_disabled'};
  if(!approvalOk)return{allowed:false,status:403,reason:'explicit_approval_required'};
  return{allowed:true,status:200,mode:'paused_write_only'};
 }
 return{allowed:false,status:403,reason:'action_not_allowed'};
}
function publicRuntimeCapabilities(){return{secrets_exposed:false,environment_mutation:false,deploy_mutation:false,active_ads_write:false,read_actions:[...READ_ACTIONS],write_actions:[...WRITE_ACTIONS]};}
module.exports={READ_ACTIONS,WRITE_ACTIONS,safeEqual,authorizeControlPlane,publicRuntimeCapabilities};
