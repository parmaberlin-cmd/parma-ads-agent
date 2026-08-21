const test = require("node:test");
const assert = require("node:assert/strict");
const { buildShadowAgentReport } = require("../agent-shadow");

test("shadow mode always remains read-only", () => {
  const report = buildShadowAgentReport({});
  assert.equal(report.mode, "shadow");
  assert.equal(report.writes_allowed, false);
});
