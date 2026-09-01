const OUTCOMES = Object.freeze({
  reservation_completed: {
    required_ground_truth: 'reservation_system',
    canonical_time_basis: 'created_date',
    cancellation_policy_required: true,
  },
  direct_order_completed: {
    required_ground_truth: 'direct_order_system',
    canonical_time_basis: 'order_created_date',
    refund_policy_required: true,
  },
  marketplace_order_completed: {
    required_ground_truth: 'marketplace_order_system',
    canonical_time_basis: 'order_created_date',
    refund_policy_required: true,
  },
  probable_walk_in: {
    required_ground_truth: null,
    canonical_time_basis: null,
    analytical_hypothesis_only: true,
  },
});

function validateOutcomeEvidence(input = {}) {
  const definition = OUTCOMES[input.outcome];
  if (!definition) return { valid:false, blockers:['unknown_outcome'], optimization_allowed:false, writes_allowed:false };
  const blockers = [];
  if (definition.analytical_hypothesis_only) blockers.push('outcome_not_directly_verified');
  if (!input.semantic_identity_verified) blockers.push('semantic_identity_unverified');
  if (!input.exact_date_window) blockers.push('exact_date_window_missing');
  if (!input.timezone) blockers.push('timezone_missing');
  if (!input.date_basis) blockers.push('date_basis_missing');
  if (!input.counting_rule) blockers.push('counting_rule_missing');
  if (!input.dedupe_rule) blockers.push('dedupe_rule_missing');
  if (!input.maturity_verified) blockers.push('maturity_unverified');
  if (definition.required_ground_truth && input.ground_truth_source !== definition.required_ground_truth) blockers.push('ground_truth_missing_or_wrong_source');
  if (definition.cancellation_policy_required && !input.cancellation_policy) blockers.push('cancellation_policy_missing');
  if (definition.refund_policy_required && !input.refund_policy) blockers.push('refund_policy_missing');
  return {
    outcome: input.outcome,
    definition,
    valid: blockers.length === 0,
    blockers,
    optimization_allowed: blockers.length === 0,
    writes_allowed: false,
    execution_authorized: false,
  };
}

module.exports = { OUTCOMES, validateOutcomeEvidence };
