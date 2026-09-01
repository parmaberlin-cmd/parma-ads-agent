const test = require("node:test");
const assert = require("node:assert/strict");
const { selectNextAutonomousAction } = require("../next-action-engine");

test("external Wix blocker does not stop unrelated autonomous work", () => {
  const out = selectNextAutonomousAction([
    { id: "EXT-1", priority: "P0", status: "BLOCKED_EXTERNAL", blocker_type: "external_access" },
    { id: "AUTO-1", priority: "P1", status: "READY", blocker_type: "software", autonomous: true, operation: 'test', permission_class: 'GREEN' },
  ]);
  assert.equal(out.selected.id, "AUTO-1");
  assert.equal(out.stopped_for_user, false);
});

test("permission gates are never selected as autonomous work", () => {
  const out = selectNextAutonomousAction([{ id: "GATE", priority: "P0", status: "BLOCKED_PERMISSION", blocker_type: "permission_gate" }]);
  assert.equal(out.selected, null);
  assert.equal(out.stopped_for_user, true);
});
