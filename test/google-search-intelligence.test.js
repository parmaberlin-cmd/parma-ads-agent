const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeSearchTerms, analyzeKeywords } = require("../google-search-intelligence");

test("search terms are flagged only after useful evidence", () => {
  const rows = analyzeSearchTerms([
    { search_term:"pizza berlin", clicks:2, cost_eur:1, conversions:0 },
    { search_term:"jobs pizza", clicks:5, cost_eur:5, conversions:0 },
    { search_term:"bio pizza", clicks:2, cost_eur:2, conversions:1 },
  ]);
  assert.equal(rows[0].signal,"insufficient_data");
  assert.equal(rows[1].signal,"review_for_negative");
  assert.equal(rows[2].signal,"productive");
});

test("keywords remain read-only diagnostic signals", () => {
  const rows = analyzeKeywords([{ keyword:"pizza kreuzberg", clicks:8, cost_eur:8, conversions:0 }]);
  assert.equal(rows[0].signal,"underperforming_review");
  assert.equal(rows[0].proposed_write, undefined);
});
