const test = require('node:test');
const assert = require('node:assert/strict');
const { auditSearchTermCorpus } = require('../search-term-corpus-audit');

test('accounts for every search term row without exposing raw queries', () => {
  const rows = [
    {search_term:'pizza near me',matched_keyword:'beste pizza berlin',match_type:'BROAD',impressions:20,clicks:3,cost_eur:.4},
    {search_term:'pizza in meiner nähe',matched_keyword:'beste pizza berlin',match_type:'BROAD',impressions:10,clicks:1,cost_eur:.1},
    {search_term:'pizza recipe',matched_keyword:'pizza berlin',match_type:'BROAD',impressions:5,clicks:1,cost_eur:.2},
  ];
  const out = auditSearchTermCorpus(rows);
  assert.equal(out.coverage.search_term_rows_received, 3);
  assert.equal(out.coverage.search_term_rows_accounted_for, 3);
  assert.equal(out.coverage.complete_for_received_corpus, true);
  assert.equal(out.privacy.raw_search_terms_logged, false);
  assert.equal(JSON.stringify(out).includes('pizza recipe'), false);
  assert.equal(out.writes_allowed, false);
});

test('protects local intent even when no conversion evidence is used', () => {
  const out = auditSearchTermCorpus([{search_term:'pizza near me',matched_keyword:'pizza berlin',match_type:'BROAD',impressions:10,clicks:2,cost_eur:.3}]);
  assert.equal(out.cells[0].protected_local_intent, true);
  assert.equal(out.cells[0].automatic_negative_supported, false);
  assert.equal(out.cells[0].conversion_evidence_used, false);
});

test('non-local spend can enter manual semantic review but never automatic negatives', () => {
  const out = auditSearchTermCorpus([{search_term:'pizza recipe',matched_keyword:'pizza berlin',match_type:'BROAD',impressions:10,clicks:2,cost_eur:.5}]);
  assert.equal(out.cells[0].manual_semantic_review_candidate, true);
  assert.equal(out.cells[0].automatic_negative_supported, false);
  assert.equal(out.negative_keyword_execution_allowed, false);
});