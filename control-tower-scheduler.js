'use strict';
const store=require('./control-tower-state');const {runUntilStop,TERMINAL}=require('./control-tower-runtime');
function clampMinutes(v){const n=Number(v);return Number.isFinite(n)?Math.max(5,Math.min(1440,Math.round(n))):15;}
function startControlTowerScheduler({env=process.env,executors={},setTimer=setInterval}={}){
  if(env.AUTONOMOUS_WORK_LOOP_ENABLED!=='true')return{enabled:false,reason:'disabled'};
  const storage=store.storageStatus(env);if(!storage.durable)return{enabled:false,reason:'durable_storage_required',storage};
  const loaded=store.load(storage.path);if(loaded.exists&&!loaded.healthy)return{enabled:false,reason:'state_corrupt',storage};
  const minutes=clampMinutes(env.AUTONOMOUS_WORK_INTERVAL_MINUTES);let running=false;
  async function tick(){if(running)return{skipped:true,reason:'overlap'};running=true;try{const current=store.load(storage.path);if(!current.exists)return{skipped:true,reason:'state_missing'};if(!current.healthy)return{skipped:true,reason:'state_corrupt'};if(TERMINAL.has(current.state.status))return current.state;return await runUntilStop({file:storage.path,executors,maxSteps:20});}finally{running=false;}}
  const timer=setTimer(()=>tick().catch(()=>{}),minutes*60*1000);if(timer&&typeof timer.unref==='function')timer.unref();return{enabled:true,interval_minutes:minutes,storage,tick,timer};
}
module.exports={clampMinutes,startControlTowerScheduler};
