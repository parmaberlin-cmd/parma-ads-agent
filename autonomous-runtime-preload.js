'use strict';

const realExpress = require('express');
const { apiKeysMatch } = require('./api-key-auth');
const { registerAutonomousRuntimeRoutes, startAutonomousRuntime, runtime } = require('./autonomous-runtime-service');
const { registerAutonomousResumeRoutes, persistTerminalBlockers } = require('./autonomous-runtime-resume');
const {runRuntimeSelfTest}=require('./runtime-self-test');
const {readState}=require('./autonomous-runtime');
const {emitTerminalRuntimeHandoffs,producerFailureCategory}=require('./personal-os-runtime-handoff');

function authorized(req){
  const supplied=req.headers['x-api-key']||String(req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
  return apiKeysMatch(supplied,process.env.PARMA_AGENT_API_KEY);
}

runtime.handlers['runtime.self_test']=runRuntimeSelfTest;

const baseTick=runtime.tick.bind(runtime);
runtime.tick=async function architectureAwareTick(){
  const result=await baseTick();
  persistTerminalBlockers(runtime);
  try {
    const emitted=emitTerminalRuntimeHandoffs({state:readState(runtime.file,runtime.now),env:process.env});
    if(emitted.queued>0)console.log(JSON.stringify({event:'personal_os_runtime_handoff',status:emitted.status,queued:emitted.queued,duplicates:emitted.duplicates,provider_writes:0}));
  } catch(error) {
    console.error(JSON.stringify({event:'personal_os_runtime_handoff',status:'BLOCKED',reason:producerFailureCategory(error),provider_writes:0}));
  }
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
