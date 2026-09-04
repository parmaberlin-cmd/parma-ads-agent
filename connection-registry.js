'use strict';

const registry = require('./state/CONNECTION_REGISTRY.json');

const HEALTH = new Set(['healthy','degraded','reauth_required','external_security_gate','unavailable']);

function listConnections() {
  return registry.connections.map((c) => ({
    id: c.id,
    system: c.system,
    status: c.status,
    health: HEALTH.has(c.health) ? c.health : 'unavailable',
    autonomous_read_allowed: c.autonomous_read_allowed === true,
    priority: c.priority,
    shared_agent_backend_access: c.shared_agent_backend_access,
    blocker: c.blocker || null,
    human_gate: c.human_gate || null,
    capabilities: c.capabilities || [],
    capabilities_target: c.capabilities_target || []
  }));
}

function connectionHealth(id) {
  const c = registry.connections.find((x) => x.id === id);
  if (!c) return { found:false, health:'unavailable', healthy:false, usable:false, autonomous_read_allowed:false, reason:'unknown_connection' };
  const health = HEALTH.has(c.health) ? c.health : 'unavailable';
  const autonomousRead = c.autonomous_read_allowed === true;
  const blocked = c.shared_agent_backend_access === 'BLOCKED' || health === 'unavailable' || health === 'reauth_required' || health === 'external_security_gate';
  const usable = autonomousRead && !blocked && (health === 'healthy' || health === 'degraded');
  return {
    found:true,
    id:c.id,
    system:c.system,
    status:c.status,
    health,
    healthy:health === 'healthy',
    usable,
    autonomous_read_allowed:autonomousRead,
    shared_agent_backend_access:c.shared_agent_backend_access,
    blocker:c.blocker || null
  };
}

function canUseCapability(connectionId, capability, { mutation=false } = {}) {
  const c = registry.connections.find((x) => x.id === connectionId);
  if (!c) return { allowed:false, reason:'unknown_connection' };
  const health = connectionHealth(connectionId);
  if (!health.usable) return { allowed:false, reason:'connection_not_usable', health:health.health, blocker:c.blocker || null };
  const granted = new Set(c.capabilities || []);
  if (!granted.has(capability)) return { allowed:false, reason:'capability_not_verified' };
  if (mutation) return { allowed:false, reason:'mutation_requires_separate_permission_class' };
  return { allowed:true, reason:'verified_read_capability', health:health.health };
}

function humanActionNeeded(connectionId) {
  const c = registry.connections.find((x) => x.id === connectionId);
  if (!c) return { needed:false, reason:'unknown_connection' };
  const health = connectionHealth(connectionId);
  if (health.usable || health.health === 'degraded') return { needed:false, reason:'no_current_human_gate' };
  const ownerGate = health.health === 'reauth_required' || health.health === 'external_security_gate';
  return {
    needed:ownerGate,
    reason:c.blocker || health.health,
    smallest_action:ownerGate ? (c.human_gate || null) : null
  };
}

module.exports = { listConnections, connectionHealth, canUseCapability, humanActionNeeded };
