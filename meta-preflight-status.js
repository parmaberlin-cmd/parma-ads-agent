const { executeRuntimeMetaPreflight } = require('./meta-runtime-preflight');
const { safePublicJson } = require('./public-output-safety');

const state = { status:'pending', started_at:null, finished_at:null, result:null, error:null };
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
async function run(){
 if(state.status==='running')return;
 state.status='running';state.started_at=new Date().toISOString();state.error=null;
 try{
  const result=await executeRuntimeMetaPreflight({startsAt:futureStart()});
  state.result=sanitize(result);state.status='completed';state.finished_at=new Date().toISOString();
  console.log(JSON.stringify({event:'meta_runtime_preflight',success:true,...state.result}));
 }catch(error){
  state.status='failed';state.finished_at=new Date().toISOString();state.error='meta_runtime_preflight_failed';
  console.error(JSON.stringify({event:'meta_runtime_preflight',success:false,error:state.error,mode:'read_only',may_activate:false,may_spend:false}));
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
module.exports={state,run,register,sanitize,futureStart};