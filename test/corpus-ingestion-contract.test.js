const test = require('node:test');
const assert = require('node:assert/strict');
const { ingest } = require('../corpus-ingestion-contract');

test('incomplete corpus cannot masquerade as complete audit', () => {
  const x = ingest({ keywords:[{keyword:'pizza near me', clicks:10}], search_terms:[{query:'pizza near me', clicks:5}] });
  assert.equal(x.coverage.keywords.complete, false);
  assert.equal(x.coverage.search_terms.complete, false);
  assert.equal(x.optimization_permission, false);
});

test('registered conversions remain explicitly unverified', () => {
  const x = ingest({ keywords:[{keyword:'beste pizza berlin', conversions:4}], expected_keywords:1, expected_search_terms:0 });
  assert.equal(x.keywords[0].registered_conversions, 4);
  assert.equal(x.keywords[0].conversion_status, 'unverified_diagnostic_only');
  assert.equal(x.writes_allowed, false);
});
