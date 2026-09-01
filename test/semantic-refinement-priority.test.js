const test = require('node:test');
const assert = require('node:assert/strict');
const { prioritizeSemanticRefinement } = require('../semantic-refinement-priority');

test('prioritizes costly ambiguous cells without exposing raw terms', () => {
  const out = prioritizeSemanticRefinement([
    {intent:'other',matched_keyword:'beste pizza berlin',match_type:'BROAD',search_term_rows:205,clicks:23,cost_eur:7.37,manual_semantic_review_candidate:true,review_reason:'unclassified_semantics'},
    {intent:'other',matched_keyword:'pizza kreuzberg',match_type:'BROAD',search_term_rows:10,clicks:3,cost_eur:.29,manual_semantic_review_candidate:true,review_reason:'unclassified_semantics'},
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].matched_keyword, 'beste pizza berlin');
  assert.equal(out[0].next_step, 'refine_semantic_taxonomy');
  assert.equal(out[0].automatic_negative_supported, false);
  assert.equal(out[0].execution_authorized, false);
});

test('routes competitor cells to strategy review rather than exclusion', () => {
  const out = prioritizeSemanticRefinement([{intent:'competitor_brand',matched_keyword:'beste pizza berlin',search_term_rows:3,clicks:2,cost_eur:.33,manual_semantic_review_candidate:true,review_reason:'competitor_strategy',competitor_strategy_review:true}]);
  assert.equal(out[0].next_step, 'competitor_strategy_review');
  assert.equal(out[0].automatic_negative_supported, false);
});

test('ignores cells not marked for semantic review', () => {
  assert.deepEqual(prioritizeSemanticRefinement([{intent:'near_me',manual_semantic_review_candidate:false,cost_eur:100}]), []);
});