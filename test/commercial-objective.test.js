const test = require("node:test");
const assert = require("node:assert/strict");
const { contributionValue, commercialObjectiveState } = require("../commercial-objective");

test("contribution value refuses to guess missing economics", () => {
  const out = contributionValue({ revenue: 20, food_cost: 6 });
  assert.equal(out.value, null);
  assert.equal(out.reason, "cost_inputs_missing");
});

test("contribution value uses explicit inputs only", () => {
  const out = contributionValue({ revenue: 20, food_cost: 6, payment_fee: 0.5, marketplace_commission: 0, packaging_cost: 1, incremental_labor: 2 });
  assert.equal(out.value, 10.5);
});

test("commercial objective cannot optimize on conversion volume alone", () => {
  const out = commercialObjectiveState({ measurement_verified: false, outcomes: [{ type: "reservation", revenue: 20 }] });
  assert.equal(out.objective, "incremental_verified_customer_value");
  assert.equal(out.optimization_allowed, false);
});

test("commercial optimization needs verified measurement and complete value inputs", () => {
  const out = commercialObjectiveState({ measurement_verified: true, outcomes: [{ type: "direct_order", revenue: 30, food_cost: 8, payment_fee: 1, marketplace_commission: 0, packaging_cost: 1, incremental_labor: 3 }] });
  assert.equal(out.value_model_complete, true);
  assert.equal(out.optimization_allowed, true);
  assert.equal(out.ranked_outcomes[0].contribution_value, 17);
});
