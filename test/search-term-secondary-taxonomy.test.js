const test = require('node:test');
const assert = require('node:assert/strict');
const { classifySecondaryIntent, secondarySafety } = require('../search-term-secondary-taxonomy');

test('only refines primary other terms', () => {
  assert.equal(classifySecondaryIntent('menu parma','brand'), null);
});

test('separates menu price contact dietary restaurant and area signals', () => {
  assert.equal(classifySecondaryIntent('speisekarte heute','other'), 'menu_intent');
  assert.equal(classifySecondaryIntent('preise essen','other'), 'price_intent');
  assert.equal(classifySecondaryIntent('telefon nummer','other'), 'contact_intent');
  assert.equal(classifySecondaryIntent('vegan essen','other'), 'dietary_intent');
  assert.equal(classifySecondaryIntent('ristorante','other'), 'restaurant_generic');
  assert.equal(classifySecondaryIntent('essen neukölln','other'), 'other_area');
});

test('other food categories are proposal candidates only, never execution', () => {
  const safety = secondarySafety(classifySecondaryIntent('sushi berlin','other'));
  assert.equal(safety.exclusion_candidate, true);
  assert.equal(safety.role, 'semantic_negative_proposal_candidate');
});

test('unknown phrases stay unknown rather than being forced irrelevant', () => {
  const label = classifySecondaryIntent('mystery place','other');
  assert.equal(label, 'unknown_entity_or_phrase');
  assert.equal(secondarySafety(label).exclusion_candidate, false);
});