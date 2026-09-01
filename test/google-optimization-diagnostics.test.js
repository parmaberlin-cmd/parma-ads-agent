const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeKeywordOverlap, analyzeRankBudget, analyzeDeviceDistribution, analyzeHourDistribution } = require("../google-optimization-diagnostics");

test("keyword overlap finds cross-ad-group duplication without trusting conversions", () => {
  const out = analyzeKeywordOverlap([
    { keyword: "beste pizza berlin", ad_group: "A", clicks: 20, impressions: 100, cost_eur: 4 },
    { keyword: "beste pizza berlin", ad_group: "B", clicks: 10, impressions: 80, cost_eur: 2 },
    { keyword: "pizza kreuzberg", ad_group: "A", clicks: 5, impressions: 30, cost_eur: 1 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].keyword, "beste pizza berlin");
  assert.deepEqual(out[0].ad_groups, ["A", "B"]);
  assert.equal(out[0].registered_conversions_status, "unverified_measurement");
  assert.equal(out[0].requires_write, false);
});

test("rank loss outranking budget loss blocks spend escalation", () => {
  const out = analyzeRankBudget({ searchImpressionShare: 12.38, lostIsRank: 49.22, lostIsBudget: 38.4, topImpressionRate: 9.9, absoluteTopImpressionRate: 4.5 });
  assert.equal(out.primary_constraint, "rank");
  assert.equal(out.budget_increase_supported, false);
  assert.equal(out.requires_write, false);
});

test("device distribution calculates click share read-only", () => {
  const out = analyzeDeviceDistribution([{ device: "MOBILE", clicks: 90, cost_eur: 18 }, { device: "DESKTOP", clicks: 10, cost_eur: 2 }]);
  assert.equal(out[0].device, "MOBILE");
  assert.equal(out[0].click_share, 0.9);
  assert.equal(out[0].registered_conversions_status, "unverified_measurement");
});

test("hour distribution never recommends schedule changes from unverified conversions", () => {
  const out = analyzeHourDistribution([{ day: "FRIDAY", hour: 18, clicks: 20, impressions: 100, cost_eur: 4 }]);
  assert.equal(out[0].schedule_change_supported, false);
  assert.equal(out[0].requires_write, false);
});
