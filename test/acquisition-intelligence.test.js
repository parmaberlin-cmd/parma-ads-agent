const test = require("node:test");
const assert = require("node:assert/strict");

const {
  analyzeSearchTerms,
  proposeCreativeTests,
  rankCreatives,
} = require("../acquisition-intelligence");

test("search term analysis finds negative and expansion candidates", () => {
  const result = analyzeSearchTerms([
    { search_term: "cheap pizza delivery", clicks: 8, cost_eur: 9, conversions: 0, keyword: "pizza berlin", match_type: "broad" },
    { search_term: "bio pizza kreuzberg", clicks: 7, cost_eur: 5, conversions: 3, keyword: "pizza kreuzberg", match_type: "phrase" },
  ]);

  assert.ok(result.some((item) => item.type === "negative_keyword_candidate" && item.term === "cheap pizza delivery"));
  assert.ok(result.some((item) => item.type === "broad_match_attention"));
  assert.ok(result.some((item) => item.type === "keyword_expansion_candidate" && item.term === "bio pizza kreuzberg"));
});

test("low evidence search terms are not over-classified", () => {
  const result = analyzeSearchTerms([
    { search_term: "pizza", clicks: 1, cost_eur: 0.7, conversions: 0, match_type: "broad" },
  ]);
  assert.equal(result.length, 0);
});

test("creative ranking favors booking evidence before CTR", () => {
  const ranked = rankCreatives([
    { creative_id: "a", impressions: 2000, clicks: 100, bookings: 0, spend_eur: 20, frequency: 2 },
    { creative_id: "b", impressions: 1000, clicks: 20, bookings: 2, spend_eur: 20, frequency: 2 },
  ]);
  assert.equal(ranked[0].creative_id, "b");
  assert.equal(ranked[0].evidence_status, "conversion_evidence");
});

test("creative intelligence flags fatigue and traffic without bookings", () => {
  const ranked = rankCreatives([
    { creative_id: "fatigue", impressions: 1500, clicks: 10, bookings: 0, spend_eur: 20, frequency: 4.2 },
  ]);
  assert.ok(ranked[0].flags.includes("possible_fatigue"));
  assert.ok(ranked[0].flags.includes("traffic_without_bookings"));
  const proposals = proposeCreativeTests(ranked);
  assert.equal(proposals.length, 2);
  assert.ok(proposals.every((item) => item.requires_authorization));
});

test("creative intelligence avoids declaring low-reach creative a winner", () => {
  const ranked = rankCreatives([
    { creative_id: "small", impressions: 90, clicks: 8, bookings: 0, spend_eur: 2, frequency: 1 },
  ]);
  assert.equal(ranked[0].evidence_status, "insufficient_data");
  assert.deepEqual(proposeCreativeTests(ranked), []);
});
