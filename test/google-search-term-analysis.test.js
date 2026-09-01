const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyIntent, analyzeSearchTerms } = require('../google-search-term-analysis');

test('classifies high-value local intents deterministically', () => {
  assert.equal(classifyIntent('pizza near me'), 'near_me');
  assert.equal(classifyIntent('beste pizza kreuzberg'), 'local_kreuzberg');
  assert.equal(classifyIntent('Parma Berlin'), 'brand');
  assert.equal(classifyIntent('pizza bestellen'), 'delivery_or_takeaway');
});

test('aggregates clusters while marking conversions unverified', () => {
  const out = analyzeSearchTerms([
    { search_term:'pizza near me', impressions:100, clicks:10, cost_eur:2, conversions:0 },
    { search_term:'pizza in meiner nähe', impressions:50, clicks:5, cost_eur:1, conversions:1 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].intent, 'near_me');
  assert.equal(out[0].clicks, 15);
  assert.equal(out[0].cost_eur, 3);
  assert.equal(out[0].registered_conversions, 1);
  assert.equal(out[0].conversion_status, 'unverified_measurement');
});
