function normalizeGroundTruth(input = {}) {
  const required = ['window_start','window_end','created_reservations'];
  const missing = required.filter((k) => input[k] === null || input[k] === undefined || input[k] === '');
  if (missing.length) return { valid:false, missing, ground_truth:null };
  const created = Number(input.created_reservations);
  const cancelled = input.cancelled_reservations === null || input.cancelled_reservations === undefined ? null : Number(input.cancelled_reservations);
  if (!Number.isFinite(created) || created < 0 || (cancelled !== null && (!Number.isFinite(cancelled) || cancelled < 0))) {
    return { valid:false, missing:[], ground_truth:null, reason:'invalid_counts' };
  }
  return {
    valid:true,
    missing:[],
    ground_truth:{
      source:'wix_table_reservations',
      window_start:input.window_start,
      window_end:input.window_end,
      date_basis:'reservation_created_date',
      created_reservations:created,
      cancelled_reservations:cancelled,
      pii_required:false
    }
  };
}

function adapterState() {
  return {
    mode:'dormant_contract_only',
    external_call_performed:false,
    wrong_account_allowed:false,
    credentials_required_in_state:false,
    activation_requirement:'correct Parma Wix account access'
  };
}

module.exports = { normalizeGroundTruth, adapterState };
