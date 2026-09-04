'use strict';

const { listConnections, connectionHealth, canUseCapability, humanActionNeeded } = require('./connection-registry');

function buildConnectionsView() {
  return { success:true, mode:'read_only_capability_registry', mutation_permission:false, connections:listConnections().map((connection) => ({ ...connection, health:connectionHealth(connection.id), human_action:humanActionNeeded(connection.id) })) };
}

function buildConnectionsHealth() {
  const connections = listConnections().map((connection) => connectionHealth(connection.id));
  return { success:true, mode:'read_only_health', mutation_permission:false, summary:{ total:connections.length, usable:connections.filter((x)=>x.usable).length, blocked:connections.filter((x)=>!x.usable).length }, connections };
}

function resolveCapability({ connectionId, capability, mutation=false } = {}) {
  if (!connectionId || !capability) return { success:false, allowed:false, reason:'connection_id_and_capability_required', mutation_permission:false };
  const decision = canUseCapability(connectionId, capability, { mutation:Boolean(mutation) });
  return { success:true, connection_id:connectionId, capability, requested_mutation:Boolean(mutation), mutation_permission:false, ...decision };
}

function installConnectionRoutes(app, requireApiKey) {
  app.get('/capabilities/connections', requireApiKey, (req,res)=>res.json(buildConnectionsView()));
  app.get('/health/connections', requireApiKey, (req,res)=>res.json(buildConnectionsHealth()));
  app.get('/capabilities/connections/:id/:capability', requireApiKey, (req,res)=>{
    const result=resolveCapability({connectionId:req.params.id, capability:req.params.capability, mutation:req.query.mutation==='true'});
    res.status(result.success ? 200 : 400).json(result);
  });
}

module.exports={buildConnectionsView,buildConnectionsHealth,resolveCapability,installConnectionRoutes};
