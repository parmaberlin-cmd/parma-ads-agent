const test = require('node:test');
const assert = require('node:assert/strict');
const { assessConversionConfidence } = require('../conversion-confidence');

test('similar counts alone cannot produce high confidence', () => {
  const out = assessConversionConfidence({});
  assert.equal(out.confidence, 'low');
  assert.equal(out.optimization_allowed, false);
});

test('critical reconciliation without ground truth remains below high', () => {
  const out = assessConversionConfidence({
    semantic_match:true,
    timezone_aligned:true,
    date_basis_aligned:true,
    attribution_compatible:true,
    counting_understood:true,
    data_mature:true,
  });
  assert.equal(out.confidence, 'medium');
  assert.equal(out.optimization_allowed, false);
});

test('fully reconciled evidence can enable high confidence', () => {
  const out = assessConversionConfidence({
    semantic_match:true,
    timezone_aligned:true,
    date_basis_aligned:true,
    attribution_compatible:true,
    counting_understood:true,
    data_mature:true,
    ground_truth_checked:true,
  });
  assert.equal(out.confidence, 'high');
  assert.equal(out.optimization_allowed, true);
});
