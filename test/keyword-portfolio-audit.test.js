const test = require('node:test');
const assert = require('node:assert/strict');
const { auditKeywordPortfolio } = require('../keyword-portfolio-audit');

test('audits every received keyword without trusting conversions', () => {
  const out = auditKeywordPortfolio([
    {keyword:'beste pizza berlin',ad_group:'A',ad_group_id:'1',match_type:'BROAD',status:'ENABLED',impressions:100,clicks:10,cost_eur:2},
    {keyword:'beste pizza berlin',ad_group:'B',ad_group_id:'2',match_type:'PHRASE',status:'ENABLED',impressions:50,clicks:4,cost_eur:1},
    {keyword:'pizza kreuzberg',ad_group:'A',ad_group_id:'1',match_type:'PHRASE',status:'ENABLED',impressions:20,clicks:2,cost_eur:.4},
  ]);
  assert.equal(out.coverage.rows_received, 3);
  assert.equal(out.coverage.rows_audited, 3);
  assert.equal(out.coverage.unique_normalized_keywords, 2);
  assert.equal(out.coverage.cross_ad_group_overlap_keywords, 1);
  assert.equal(out.keywords[0].registered_conversion_evidence_used, false);
  assert.equal(out.keywords[0].execution_authorized, false);
  assert.equal(out.writes_allowed, false);
});

test('local keyword intent is protected from automatic negatives', () => {
  const out = auditKeywordPortfolio([{keyword:'pizza near me',ad_group:'A',ad_group_id:'1',impressions:10,clicks:0,cost_eur:0}]);
  assert.equal(out.keywords[0].protected_local_intent, true);
  assert.equal(out.keywords[0].automatic_negative_supported, false);
  assert.equal(out.keywords[0].automatic_pause_supported, false);
});

test('empty corpus is safe and complete for what was received', () => {
  const out = auditKeywordPortfolio([]);
  assert.equal(out.coverage.rows_received, 0);
  assert.equal(out.coverage.rows_audited, 0);
  assert.equal(out.coverage.complete_for_received_corpus, true);
  assert.equal(out.spend_allowed, false);
});