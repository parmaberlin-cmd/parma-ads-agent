const TYPE_WEIGHT = { software: 4, data_maturity: 3, external_access: 1, permission_gate: 0 };
const PRIORITY_WEIGHT = { P0: 30, P1: 20, P2: 10, P3: 0 };
const TERMINAL_PREFIXES = ["DONE", "BLOCKED_EXTERNAL", "BLOCKED_PERMISSION"];

function terminal(status = "") { return TERMINAL_PREFIXES.some((x) => String(status).startsWith(x)); }
function dependenciesSatisfied(item, byId) {
  return (item.dependencies || []).every((id) => {
    const dep = byId.get(id);
    return dep && String(dep.status).startsWith("DONE");
  });
}
function selectNextAutonomousAction(items = []) {
  const byId = new Map(items.filter(Boolean).map((x) => [x.id, x]));
  const candidates = items.filter((item) => {
    if (!item || terminal(item.status)) return false;
    if (["external_access", "permission_gate"].includes(item.blocker_type)) return false;
    if (item.autonomous === false) return false;
    if (!dependenciesSatisfied(item, byId)) return false;
    return true;
  }).map((item) => ({ ...item, _score: (PRIORITY_WEIGHT[item.priority] ?? 0) + (TYPE_WEIGHT[item.blocker_type] ?? 2) }))
    .sort((a, b) => b._score - a._score || String(a.id).localeCompare(String(b.id)));
  return { selected:candidates[0]?Object.fromEntries(Object.entries(candidates[0]).filter(([k])=>k!=="_score")):null, eligible_count:candidates.length, stopped_for_user:candidates.length===0, rule:"External access and permission gates never prevent unrelated autonomous work; unresolved dependencies are skipped, not escalated." };
}
module.exports = { selectNextAutonomousAction, dependenciesSatisfied };
