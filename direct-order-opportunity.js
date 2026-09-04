function boolScore(value, weight) { return value === true ? weight : 0; }

function buildDirectOrderOpportunity(input = {}) {
  const evidenceWeights = {
    public_path_verified: 15,
    mobile_continuity_verified: 15,
    completion_semantics_verified: 20,
    dedupe_verified: 10,
    attribution_contract_verified: 10,
    refund_semantics_verified: 5,
    economics_complete: 15,
    evidence_fresh: 10,
  };
  const score = Object.entries(evidenceWeights).reduce((sum,[key,weight]) => sum + boolScore(input[key], weight), 0);
  const blockers = Object.keys(evidenceWeights).filter((key) => input[key] !== true);
  const outcomeVerified = input.completion_semantics_verified === true && input.dedupe_verified === true;
  const commercialComparisonReady = outcomeVerified && input.economics_complete === true;
  return {
    score,
    score_basis: 'evidence_readiness_not_conversion_probability',
    blockers,
    outcome_verified: outcomeVerified,
    commercial_comparison_ready: commercialComparisonReady,
    recommended_next_evidence: blockers[0] || null,
    site_change_supported: false,
    optimization_allowed: false,
    writes_allowed: false,
    spend_authorized: false,
  };
}

module.exports = { buildDirectOrderOpportunity };
