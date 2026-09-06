'use strict';

const realExpress = require('express');
const { apiKeysMatch } = require('./api-key-auth');
const { registerAutonomousRuntimeRoutes, startAutonomousRuntime, runtime } = require('./autonomous-runtime-service');
const { registerAutonomousResumeRoutes } = require('./autonomous-runtime-resume');

function authorized(req){
  const supplied=req.headers['x-api-key']||String(req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
  return apiKeysMatch(supplied,process.env.PARMA_AGENT_API_KEY);
}

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
