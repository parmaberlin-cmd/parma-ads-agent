const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyDormantKeyword, reviewDormantKeywords } = require('../dormant-keyword-review');

test('classifies off-area and competitor-like dormant keywords for review only', () => {
  assert.equal(classifyDormantKeyword('pizza wilmersdorf'), 'off_area_or_nonlocal_review');
  assert.equal(classifyDormantKeyword('pipasa potsdam'), 'off_area_or_nonlocal_review');
  assert.equal(classifyDormantKeyword('zero stress'), 'competitor_or_other_business_strategy_review');
  assert.equal(classifyDormantKeyword('l osteria near me'), 'competitor_or_other_business_strategy_review');
});

test('only includes zero-impression zero-click zero-cost rows', () => {
  const out = reviewDormantKeywords([
    {keyword:'zero stress',impressions:0,clicks:0,cost_eur:0},
    {keyword:'beste pizza berlin',impressions:10,clicks:1,cost_eur:.2},
  ]);
  assert.equal(out.dormant_rows, 1);
  assert.equal(out.items[0].keyword, 'zero stress');
  assert.equal(out.items[0].priority, 'low_while_dormant');
});

test('dormancy never authorizes pause removal or writes', () => {
  const out = reviewDormantKeywords([{keyword:'unknown phrase',impressions:0,clicks:0,cost_eur:0}]);
  assert.equal(out.items[0].pause_supported, false);
  assert.equal(out.items[0].removal_supported, false);
  assert.equal(out.items[0].execution_authorized, false);
  assert.equal(out.writes_allowed, false);
});