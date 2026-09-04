function planExperimentSequence({ rsa_diagnostics = [], keyword_overlap = [], conversion_integrity = 'unverified' } = {}) {
  const weakRsa = rsa_diagnostics.filter((row) => ['POOR','AVERAGE'].includes(String(row.ad_strength || '').toUpperCase()) || (row.issues || []).length > 0);
  const strongRsa = rsa_diagnostics.filter((row) => ['GOOD','EXCELLENT'].includes(String(row.ad_strength || '').toUpperCase()) && (row.issues || []).length === 0);
  const overlaps = (keyword_overlap || []).filter((row) => Number(row.occurrences || 0) > 1);
  const structuralAsymmetry = weakRsa.length > 0 && strongRsa.length > 0;
  const sequence = [];
  if (structuralAsymmetry) sequence.push({stage:1,experiment:'rsa_structural_rebuild',reason:'Remove ad-asset structural asymmetry before interpreting cross-ad-group routing.',budget_change_eur:0});
  if (overlaps.length) sequence.push({stage:sequence.length+1,experiment:'duplicate_keyword_routing_observation',reason:'Observe duplicate routing after RSA structure is comparable; do not mutate both variables simultaneously.',budget_change_eur:0});
  if (conversion_integrity === 'verified') sequence.push({stage:sequence.length+1,experiment:'business_outcome_optimization',reason:'Only verified outcome semantics can support conversion-led optimization.',budget_change_eur:0});
  return {
    structural_asymmetry: structuralAsymmetry,
    overlap_count: overlaps.length,
    sequence,
    simultaneous_rsa_and_keyword_mutation_supported: false,
    conversion_led_decision_supported: conversion_integrity === 'verified',
    execution_authorized: false,
    writes_allowed: false,
  };
}

module.exports = { planExperimentSequence };