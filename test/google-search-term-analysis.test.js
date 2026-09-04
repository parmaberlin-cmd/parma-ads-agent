const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyIntent, commercialRole, intentSafety, analyzeSearchTerms } = require('../google-search-term-analysis');

test('classifies high-value local intents deterministically', () => {
  assert.equal(classifyIntent('pizza near me'), 'near_me');
  assert.equal(classifyIntent('beste pizza kreuzberg'), 'local_kreuzberg');
  assert.equal(classifyIntent('Parma Berlin'), 'brand');
  assert.equal(classifyIntent('pizza bestellen'), 'delivery_or_takeaway');
});

test('separates reservation direct-order craft informational and competitor intent', () => {
  assert.equal(classifyIntent('pizza tisch reservieren'), 'reservation_intent');
  assert.equal(classifyIntent('pizza online bestellen'), 'direct_order_intent');
  assert.equal(classifyIntent('bio pizza berlin'), 'organic_bio');
  assert.equal(classifyIntent('sauerteig pizza'), 'sourdough');
  assert.equal(classifyIntent('pizza rezept'), 'informational');
  assert.equal(classifyIntent('zola pizza'), 'competitor_brand');
  assert.equal(commercialRole('reservation_intent'), 'likely_reservation');
  assert.equal(commercialRole('direct_order_intent'), 'likely_direct_order');
});

test('local intent explicitly protects against premature negative keywords', () => {
  const safety = intentSafety('near_me');
  assert.equal(safety.local_intent, true);
  assert.equal(safety.walk_in_measurement_risk, true);
  assert.equal(safety.negative_keyword_supported, false);
});

test('informational intent can be a proposal candidate but never an automatic negative', () => {
  const safety = intentSafety('informational');
  assert.equal(safety.semantic_negative_candidate, true);
  assert.equal(safety.negative_keyword_supported, false);
});

test('competitor intent is routed to strategy review instead of automatic exclusion', () => {
  const safety = intentSafety('competitor_brand');
  assert.equal(safety.competitor_strategy_review, true);
  assert.equal(safety.negative_keyword_supported, false);
});

test('aggregates clusters while marking conversions unverified', () => {
  const out = analyzeSearchTerms([
    { search_term:'pizza near me', impressions:100, clicks:10, cost_eur:2, conversions:0 },
    { search_term:'pizza in meiner nähe', impressions:50, clicks:5, cost_eur:1, conversions:1 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].intent, 'near_me');
  assert.equal(out[0].commercial_role, 'likely_visit_or_walk_in');
  assert.equal(out[0].clicks, 15);
  assert.equal(out[0].cost_eur, 3);
  assert.equal(out[0].registered_conversions, 1);
  assert.equal(out[0].conversion_status, 'unverified_measurement');
  assert.equal(out[0].negative_keyword_supported, false);
  assert.equal(out[0].walk_in_measurement_risk, true);
  assert.equal(out[0].requires_write, false);
});
