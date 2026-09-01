const REQUIREMENTS = Object.freeze({
  reservation: ['semantic_identity','exact_date_window','timezone','date_basis','counting_dedupe','maturity','reservation_ground_truth','cancellation_semantics'],
  direct_order: ['public_path','mobile_continuity','completion_semantics','counting_dedupe','attribution','refund_semantics','direct_order_ground_truth','economics'],
  walk_in: ['local_action_observation','walk_in_ground_truth','date_window','economics'],
});

function planEvidenceGaps(evidence = {}) {
  const work = [];
  for (const [outcome, requirements] of Object.entries(REQUIREMENTS)) {
    for (const requirement of requirements) {
      if (evidence[outcome]?.[requirement] === true) continue;
      const external = /ground_truth/.test(requirement);
      work.push({
        outcome,
        requirement,
        blocker_type: external ? 'external_or_business_data' : 'data_or_software_evidence',
        can_continue_without_external_access: !external,
        mutation_required:false,
      });
    }
  }
  const autonomous = work.filter((item) => item.can_continue_without_external_access);
  const external = work.filter((item) => !item.can_continue_without_external_access);
  return {
    total_gaps:work.length,
    autonomous_gaps:autonomous,
    external_gaps:external,
    next_green:autonomous[0] || null,
    human_gate_needed_now: autonomous.length === 0 && external.length > 0,
    writes_allowed:false,
  };
}

module.exports = { REQUIREMENTS, planEvidenceGaps };
