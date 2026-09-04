const DIMENSIONS = [
  'semantic_match',
  'timezone_aligned',
  'date_basis_aligned',
  'attribution_compatible',
  'counting_understood',
  'data_mature',
  'ground_truth_checked',
];

function normalizeEvidence(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  if (value === 'partial') return 0.5;
  return null;
}

function assessConversionConfidence(evidence = {}) {
  const dimensions = {};
  let known = 0;
  let score = 0;
  for (const name of DIMENSIONS) {
    const value = normalizeEvidence(evidence[name]);
    dimensions[name] = value;
    if (value != null) { known += 1; score += value; }
  }
  const normalized = known ? score / DIMENSIONS.length : 0;
  const criticalReady = dimensions.semantic_match === 1 && dimensions.date_basis_aligned === 1 && dimensions.attribution_compatible === 1;
  let confidence = 'low';
  if (criticalReady && normalized >= 0.85 && dimensions.ground_truth_checked === 1) confidence = 'high';
  else if (criticalReady && normalized >= 0.6) confidence = 'medium';
  return {
    confidence,
    score: normalized,
    dimensions,
    optimization_allowed: confidence === 'high',
    rationale: confidence === 'high' ? 'conversion evidence reconciled' : 'conversion evidence not yet sufficient for optimization',
  };
}

module.exports = { assessConversionConfidence, DIMENSIONS };
