const ACTIONS = new Set(['website','directions','phone','reservation','direct_order','marketplace_order']);

function classifyLocalAction(input = {}) {
  const action = String(input.action || '').trim().toLowerCase();
  if (!ACTIONS.has(action)) return { action:'unknown', business_outcome:'unknown', verified_customer:false, optimization_signal:false };
  const map = {
    website:'intent_signal', directions:'probable_visit_signal', phone:'contact_signal',
    reservation:'reservation_funnel', direct_order:'direct_order_funnel', marketplace_order:'marketplace_order_funnel',
  };
  return { action, business_outcome:map[action], verified_customer:false, optimization_signal:false };
}

function buildWalkInMeasurementState(input = {}) {
  const directions = Number.isFinite(Number(input.directions)) ? Math.max(0, Number(input.directions)) : null;
  const phone = Number.isFinite(Number(input.phone)) ? Math.max(0, Number(input.phone)) : null;
  const verifiedWalkIns = Number.isFinite(Number(input.verified_walk_ins)) ? Math.max(0, Number(input.verified_walk_ins)) : null;
  return {
    directions,
    phone,
    verified_walk_ins:verifiedWalkIns,
    walk_in_measurement_complete: verifiedWalkIns != null,
    local_actions_are_not_walk_ins: true,
    protect_local_intent_from_conversion_only_pruning: verifiedWalkIns == null,
    negative_keyword_permission:false,
    targeting_change_permission:false,
    writes_allowed:false,
  };
}

module.exports = { classifyLocalAction, buildWalkInMeasurementState };
