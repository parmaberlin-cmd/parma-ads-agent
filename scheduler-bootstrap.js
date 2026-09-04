const axios = require('axios');
const { load, runGoal, storageStatus } = require('./autonomous-runtime');

function clampRefreshMinutes(value) { const parsed=Number(value); if(!Number.isFinite(parsed))return 60; return Math.max(15,Math.min(1440,Math.round(parsed))); }
function buildRefreshUrl(env=process.env){const port=Number(env.PORT||3000);return `http://127.0.0.1:${port}/tools/agent/shadow/refresh`;}
function startReadonlyShadowScheduler({env=process.env,client=axios}={}){
 const apiKey=env.PARMA_AGENT_API_KEY;if(!apiKey){console.warn(JSON.stringify({event:'shadow_scheduler',enabled:false,reason:'api_key_missing',writes_allowed:false}));return null;}
 const intervalMinutes=clampRefreshMinutes(env.SHADOW_REFRESH_INTERVAL_MINUTES||60),intervalMs=intervalMinutes*60*1000,url=buildRefreshUrl(env);
 async function tick(){try{const response=await client.post(url,null,{headers:{'x-api-key':apiKey},timeout:30000,validateStatus:()=>true});console.log(JSON.stringify({event:'shadow_scheduler_tick',success:response.status===202,status_code:response.status,refresh_status:response.data?.status||null,interval_minutes:intervalMinutes,writes_allowed:false}));}catch{console.error(JSON.stringify({event:'shadow_scheduler_tick',success:false,error:'refresh_request_failed',interval_minutes:intervalMinutes,writes_allowed:false}));}}
 const timer=setInterval(()=>tick().catch(()=>{}),intervalMs);if(typeof timer.unref==='function')timer.unref();console.log(JSON.stringify({event:'shadow_scheduler',enabled:true,interval_minutes:intervalMinutes,writes_allowed:false}));return{timer,tick,intervalMinutes,url};
}
function startAutonomousWorkScheduler({env=process.env,executors={}}={}){
 const storage=storageStatus(env);if(env.AUTONOMOUS_WORK_LOOP_ENABLED!=='true')return null;if(!storage.durable){console.warn(JSON.stringify({event:'autonomous_work_scheduler',enabled:false,reason:'durable_storage_required'}));return null;}
 const minutes=clampRefreshMinutes(env.AUTONOMOUS_WORK_INTERVAL_MINUTES||15);
 async function tick(){const state=load(storage.path);if(!state||['DONE','NEEDS_HUMAN','BLOCKED_EXTERNAL'].includes(state.current_state))return state;return runGoal({goal:state.goal,tasks:state.tasks,executors,file:storage.path,maxSteps:20});}
 const timer=setInterval(()=>tick().catch(()=>{}),minutes*60*1000);if(typeof timer.unref==='function')timer.unref();tick().catch(()=>{});return{timer,tick,intervalMinutes:minutes,storage};
}
require('./operational-live-pulse-preload');require('./google-campaign-intelligence-preload');require('./bootstrap');startReadonlyShadowScheduler();startAutonomousWorkScheduler();
module.exports={clampRefreshMinutes,buildRefreshUrl,startReadonlyShadowScheduler,startAutonomousWorkScheduler};
