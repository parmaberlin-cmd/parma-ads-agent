const test = require("node:test");
const assert = require("node:assert/strict");
const { triageAnomaly } = require("../anomaly-triage");

test("degraded conversion integrity blocks conversion optimization", () => {
  const out = triageAnomaly({ source_health: true, conversion_integrity: "degraded", window_mature: true, lost_is_budget: 45.5, lost_is_rank: 41.6 });
  assert.equal(out.optimization_allowed, false);
  assert.equal(out.root_cause_proven, false);
  assert.ok(out.hypotheses.some((x) => x.type === "measurement"));
  assert.ok(out.hypotheses.some((x) => x.type === "budget_constraint"));
});

test("rank greater than budget is descriptive not spend permission", () => {
  const out = triageAnomaly({ source_health: true, conversion_integrity: "verified", window_mature: true, lost_is_budget: 30, lost_is_rank: 50 });
  const rank = out.hypotheses.find((x) => x.type === "rank_constraint");
  assert.equal(rank.confidence, "descriptive_only");
  assert.equal(out.root_cause_proven, false);
});

test("immature data blocks optimization without inventing a cause", () => {
  const out = triageAnomaly({ source_health: true, conversion_integrity: "verified", window_mature: false });
  assert.equal(out.optimization_allowed, false);
  assert.equal(out.root_cause_proven, false);
});
