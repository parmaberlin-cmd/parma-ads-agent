'use strict';

const realExpress = require('express');
const { apiKeysMatch } = require('./api-key-auth');
const { registerAutonomousRuntimeRoutes, startAutonomousRuntime, runtime } = require('./autonomous-runtime-service');
const { registerAutonomousResumeRoutes, persistTerminalBlockers } = require('./autonomous-runtime-resume');

function authorized(req){
  const supplied=req.headers['x-api-key']||String(req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
  return apiKeysMatch(supplied,process.env.PARMA_AGENT_API_KEY);
}

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
