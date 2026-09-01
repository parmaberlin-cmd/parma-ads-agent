const TYPE_WEIGHT = { software: 4, data_maturity: 3, external_access: 1, permission_gate: 0 };
const PRIORITY_WEIGHT = { P0: 30, P1: 20, P2: 10, P3: 0 };

function selectNextAutonomousAction(items = []) {
  const candidates = items.filter((item) => {
    if (!item || item.status === "DONE") return false;
    if (["BLOCKED_EXTERNAL", "BLOCKED_PERMISSION"].includes(item.status)) return false;
    if (["external_access", "permission_gate"].includes(item.blocker_type)) return false;
    return item.autonomous !== false;
  }).map((item) => ({
    ...item,
    _score: (PRIORITY_WEIGHT[item.priority] ?? 0) + (TYPE_WEIGHT[item.blocker_type] ?? 2),
  })).sort((a, b) => b._score - a._score || String(a.id).localeCompare(String(b.id)));

  return {
    selected: candidates[0] ? Object.fromEntries(Object.entries(candidates[0]).filter(([k]) => k !== "_score")) : null,
    eligible_count: candidates.length,
    stopped_for_user: candidates.length === 0,
    rule: "External access and permission gates never prevent unrelated autonomous work.",
  };
}

module.exports = { selectNextAutonomousAction };
