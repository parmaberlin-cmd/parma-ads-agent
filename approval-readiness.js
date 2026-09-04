const GATES = Object.freeze({
  reader_publish: ['ci_green','reader_read_only_verified','sanitization_verified'],
  rsa_publish: ['rsa_assets_valid','rollback_defined','experiment_isolated'],
  tracking_change: ['measurement_defect_proven','ground_truth_verified','rollback_defined'],
  keyword_change: ['routing_evidence_mature','rsa_observation_complete','rollback_defined'],
  site_change: ['direct_order_semantics_verified','mobile_path_verified','rollback_defined'],
  spend_change: ['measurement_verified','customer_value_verified','marginal_response_verified','rollback_defined'],
});

function approvalReadiness(evidence = {}) {
  const gates = {};
  for (const [gate, requirements] of Object.entries(GATES)) {
    const missing = requirements.filter((key) => evidence[key] !== true);
    gates[gate] = { ready_for_human_decision:missing.length === 0, missing_prerequisites:missing, approval_granted:false };
  }
  const ready = Object.entries(gates).filter(([,state]) => state.ready_for_human_decision).map(([gate]) => gate);
  return {
    gates,
    surface_to_human:ready,
    ask_nothing_if_none_ready:ready.length === 0,
    execution_authorized:false,
    writes_allowed:false,
    spend_authorized:false,
  };
}

module.exports = { GATES, approvalReadiness };
