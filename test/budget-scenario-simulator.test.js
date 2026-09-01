const test = require("node:test");
const assert = require("node:assert/strict");
const { simulateBudgetScenarios } = require("../budget-scenario-simulator");

test("budget increases stay blocked when measurement is unverified", () => {
  const rows = simulateBudgetScenarios({ current_daily_budget: 3.5, scenarios: [3.5, 5, 7, 10], measurement_verified: false, marginal_response_verified: false });
  assert.equal(rows[0].recommendation_allowed, true);
  assert.equal(rows[1].recommendation_allowed, false);
  assert.equal(rows[3].execution_allowed, false);
  assert.equal(rows[3].spend_authorized, false);
});

test("even evidence-ready budget scenarios never self-authorize spend", () => {
  const [row] = simulateBudgetScenarios({ current_daily_budget: 3.5, scenarios: [5], measurement_verified: true, marginal_response_verified: true });
  assert.equal(row.recommendation_allowed, true);
  assert.equal(row.execution_allowed, false);
  assert.equal(row.spend_authorized, false);
});
