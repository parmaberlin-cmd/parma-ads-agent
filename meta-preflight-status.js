const { executeRuntimeMetaPreflight } = require('./meta-runtime-preflight');
const { safePublicJson } = require('./public-output-safety');

const state = { status:'pending', started_at:null, finished_at:null, result:null, error:null, diagnostic:null };
const phases = new Set(['configuration','transport','account_read','schedule_validation','asset_read','draft_validation','provider_preflight','result_validation']);
function exceptionCategory(error){
 try{
  const status=error?.response?.status;
  const code=error?.response?.data?.error?.code;
  if(code===190||status===401)return 'authentication';
  if(code===10||code===200||status===403)return 'permission';
  if(code===4||code===17||code===32||code===613||status===429)return 'rate_limit';
  if(error?.code==='ECONNABORTED'||error?.code==='ETIMEDOUT')return 'timeout';
  if(['ECONNRESET','ENOTFOUND','EAI_AGAIN','ECONNREFUSED'].includes(error?.code))return 'network';
  if(Number.isInteger(status)&&status>=500&&status<=599)return 'provider_unavailable';
  if(Number.isInteger(status)&&status>=400&&status<=499)return 'provider_request';
 }catch{}
 return 'unknown';
}
function futureStart(){ return new Date(Date.now()+24*60*60*1000).toISOString(); }
function sanitize(result){
 if(!result)return null;
 return {
  read_only_ready:Boolean(result.read_only_ready),
  write_ready:Boolean(result.write_ready),
  ready:Boolean(result.read_only_ready),
  mode:'read_only',
  levels:result.levels||null,
  chain:result.chain||null,
  blockers:Array.isArray(result.read_only_blockers)?result.read_only_blockers:[],
  write_blockers:Array.isArray(result.write_blockers)?result.write_blockers:[],
  maximum_attempts:result.maximum_attempts??1,
  may_activate:false,
  may_spend:false,
  account:result.account?{
    readable:Boolean(result.account.readable),
    timezone_name:result.account.timezone_name||null,
    expected_timezone:result.account.expected_timezone||null,
    currency:result.account.currency||null,
    expected_currency:result.account.expected_currency||null,
    timezone_match:Boolean(result.account.timezone_match),
    schedule_conversion_required:Boolean(result.account.schedule_conversion_required),
    schedule_conversion_safe:Boolean(result.account.schedule_conversion_safe),
    currency_match:Boolean(result.account.currency_match),
    account_status_present:Boolean(result.account.account_status_present),
    blockers:result.account.blockers||[]
  }:null
 };
}
async function run({execute=executeRuntimeMetaPreflight}={}){
 if(state.status==='running')return;
 state.status='running';state.started_at=new Date().toISOString();state.error=null;state.diagnostic=null;state.result=null;
 let phase='configuration';
 try{
  const result=await execute({startsAt:futureStart(),onPhase:value=>{phase=phases.has(value)?value:'unknown';}});
  phase='result_validation';
  state.result=sanitize(result);state.status='completed';state.finished_at=new Date().toISOString();
  console.log(JSON.stringify({event:'meta_runtime_preflight',success:true,...state.result}));
 }catch(error){
  state.status='failed';state.finished_at=new Date().toISOString();state.error='meta_runtime_preflight_failed';
  state.diagnostic={phase,category:exceptionCategory(error)};
  console.error(JSON.stringify({event:'meta_runtime_preflight',success:false,error:state.error,diagnostic:state.diagnostic,mode:'read_only',may_activate:false,may_spend:false}));
 }
}
function register(app){
 app.get('/health/meta-real-preflight-summary',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(state.status==='pending'||state.status==='running')return safePublicJson(res.status(202),{success:true,status:state.status,mode:'read_only',may_activate:false,may_spend:false,started_at:state.started_at});
  if(state.status==='failed')return safePublicJson(res.status(500),{success:false,status:'failed',mode:'read_only',may_activate:false,may_spend:false,error:'meta_runtime_preflight_failed',finished_at:state.finished_at});
  return safePublicJson(res,{success:true,status:'completed',finished_at:state.finished_at,...state.result});
 });
}
module.exports={state,run,register,sanitize,futureStart,exceptionCategory};
