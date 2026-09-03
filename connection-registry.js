const registry = require('./state/CONNECTION_REGISTRY.json');

function listConnections() {
  return registry.connections.map((c) => ({
    id: c.id,
    system: c.system,
    status: c.status,
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
  if (!c) return { found:false, healthy:false, usable:false, reason:'unknown_connection' };
  const connected = /^CONNECTED/.test(c.status) || c.status === 'BACKEND_SOURCE_PRESENT_DIAGNOSTIC_PARTIAL';
  const blocked = c.shared_agent_backend_access === 'BLOCKED';
  return {
    found:true,
    id:c.id,
    system:c.system,
    status:c.status,
    healthy:connected && !blocked,
    usable:connected && !blocked,
    shared_agent_backend_access:c.shared_agent_backend_access,
    blocker:c.blocker || null
  };
}

function canUseCapability(connectionId, capability, { mutation=false } = {}) {
  const c = registry.connections.find((x) => x.id === connectionId);
  if (!c) return { allowed:false, reason:'unknown_connection' };
  if (c.shared_agent_backend_access === 'BLOCKED') return { allowed:false, reason:'connection_blocked', blocker:c.blocker || null };
  const granted = new Set(c.capabilities || []);
  if (!granted.has(capability)) return { allowed:false, reason:'capability_not_verified' };
  if (mutation) return { allowed:false, reason:'mutation_requires_separate_permission_class' };
  return { allowed:true, reason:'verified_read_capability' };
}

function humanActionNeeded(connectionId) {
  const c = registry.connections.find((x) => x.id === connectionId);
  if (!c) return { needed:false, reason:'unknown_connection' };
  if (c.shared_agent_backend_access !== 'BLOCKED') return { needed:false, reason:'no_current_human_gate' };
  return { needed:true, reason:c.blocker || 'blocked', smallest_action:c.human_gate || null };
}

module.exports = { listConnections, connectionHealth, canUseCapability, humanActionNeeded };
