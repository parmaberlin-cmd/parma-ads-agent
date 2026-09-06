'use strict';

const realExpress = require('express');
const { apiKeysMatch } = require('./api-key-auth');
const { registerAutonomousRuntimeRoutes, startAutonomousRuntime, runtime } = require('./autonomous-runtime-service');
const { registerAutonomousResumeRoutes, persistTerminalBlockers } = require('./autonomous-runtime-resume');

function authorized(req){
  const supplied=req.headers['x-api-key']||String(req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
  return apiKeysMatch(supplied,process.env.PARMA_AGENT_API_KEY);
}

runtime.handlers['runtime.self_test']=async({task})=>{
  const mode=String(task.input?.mode||'pass');
  const holdMs=Math.max(0,Math.min(60000,Number(task.input?.hold_ms||0)));
  if(holdMs)await new Promise(resolve=>setTimeout(resolve,holdMs));
  if(mode==='retry_once'&&Number(task.attempts)===1)return {validated:false,correctable:true,evidence:{schema:'runtime.self_test.v1',mode,attempt:task.attempts,writes_attempted:0,spend_attempted:0}};
  if(!['pass','retry_once','hold'].includes(mode))return {validated:false,correctable:false,evidence:{schema:'runtime.self_test.v1',mode:'invalid',writes_attempted:0,spend_attempted:0}};
  return {validated:true,evidence:{schema:'runtime.self_test.v1',mode,attempt:task.attempts,hold_ms:holdMs,writes_attempted:0,spend_attempted:0}};
};

const baseTick=runtime.tick.bind(runtime);
runtime.tick=async function architectureAwareTick(){
  const result=await baseTick();
  persistTerminalBlockers(runtime);
  return result;
};

function wrappedExpress(...args){
  const app=realExpress(...args);
  registerAutonomousRuntimeRoutes(app,{authorized});
  registerAutonomousResumeRoutes(app,{authorized,runtime});
  return app;
}
Object.assign(wrappedExpress,realExpress);
require.cache[require.resolve('express')].exports=wrappedExpress;
startAutonomousRuntime();

module.exports={authorized};
