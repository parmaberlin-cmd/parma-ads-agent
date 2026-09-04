'use strict';

const realExpress = require('express');
const { apiKeysMatch } = require('./api-key-auth');
const { registerAutonomousRuntimeRoutes, startAutonomousRuntime } = require('./autonomous-runtime-service');

function authorized(req){
  const supplied=req.headers['x-api-key']||String(req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
  return apiKeysMatch(supplied,process.env.PARMA_AGENT_API_KEY);
}

function wrappedExpress(...args){
  const app=realExpress(...args);
  registerAutonomousRuntimeRoutes(app,{authorized});
  return app;
}
Object.assign(wrappedExpress,realExpress);
require.cache[require.resolve('express')].exports=wrappedExpress;
startAutonomousRuntime();

module.exports={authorized};
