const VALID_CLASSES = new Set(["GREEN","YELLOW","RED"]);

function nonEmpty(value) {
  const s = String(value || "").trim();
  return s || null;
}

function buildMutationPackage(input = {}) {
  const permissionClass = String(input.permission_class || "").toUpperCase();
  if (!VALID_CLASSES.has(permissionClass)) throw new TypeError("permission_class must be GREEN, YELLOW or RED");
  const entity = nonEmpty(input.entity);
  const change = nonEmpty(input.proposed_change);
  const rollback = nonEmpty(input.rollback);
  if (!entity || !change || !rollback) throw new TypeError("entity, proposed_change and rollback are required");

  return {
    schema_version: "1.0.0",
    mode: "simulation_only",
    entity,
    proposed_change: change,
    evidence: Array.isArray(input.evidence) ? input.evidence.filter(Boolean).map(String) : [],
    expected_effect: nonEmpty(input.expected_effect),
    risk: nonEmpty(input.risk) || "unknown",
    permission_class: permissionClass,
    success_threshold: nonEmpty(input.success_threshold),
    failure_threshold: nonEmpty(input.failure_threshold),
    observation_period: nonEmpty(input.observation_period),
    rollback,
    writes_authorized: false,
    execution_authorized: false,
    spend_authorized: false,
  };
}

module.exports = { buildMutationPackage };
