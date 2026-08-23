const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("operational runtime smoke requires healthy history but allows ephemeral classification", () => {
  const workflow = fs.readFileSync(".github/workflows/operational-runtime-smoke.yml", "utf8");
  assert.match(workflow, /history_healthy=.*\.history\.storage\.healthy == true/);
  assert.match(workflow, /\[ "\$history_healthy" = "true" \]/);
  assert.match(workflow, /hist=\$\{safe_history\}:healthy=\$\{history_healthy\}/);
  assert.doesNotMatch(workflow, /history_class" = "durable_candidate"/);
  assert.doesNotMatch(workflow, /write_gate|approval_token|budget|activate/i);
});
