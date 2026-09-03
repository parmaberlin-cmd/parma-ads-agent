function normalizeGroundTruth(input = {}) {
  const required = ['window_start','window_end','created_reservations'];
  const missing = required.filter((k) => input[k] === null || input[k] === undefined || input[k] === '');
  if (missing.length) return { valid:false, missing, ground_truth:null };
  const created = Number(input.created_reservations);
  const cancelled = input.cancelled_reservations === null || input.cancelled_reservations === undefined ? null : Number(input.cancelled_reservations);
  const confirmed = input.confirmed_reservations === null || input.confirmed_reservations === undefined ? null : Number(input.confirmed_reservations);
  const pending = input.pending_reservations === null || input.pending_reservations === undefined ? null : Number(input.pending_reservations);
  const online = input.online_reservations === null || input.online_reservations === undefined ? null : Number(input.online_reservations);
  const counts = [created,cancelled,confirmed,pending,online].filter((x) => x !== null);
  if (counts.some((x) => !Number.isFinite(x) || x < 0)) return { valid:false, missing:[], ground_truth:null, reason:'invalid_counts' };
  if (cancelled !== null && cancelled > created) return { valid:false, missing:[], ground_truth:null, reason:'cancelled_exceeds_created' };
  if (confirmed !== null && pending !== null && cancelled !== null && confirmed + pending + cancelled !== created) return { valid:false, missing:[], ground_truth:null, reason:'status_counts_do_not_sum_to_created' };
  if (online !== null && online > created) return { valid:false, missing:[], ground_truth:null, reason:'online_exceeds_created' };
  return {
    valid:true,
    missing:[],
    ground_truth:{
      source:'wix_table_reservations',
      window_start:input.window_start,
      window_end:input.window_end,
      date_basis:'reservation_created_date',
      created_reservations:created,
      confirmed_reservations:confirmed,
      pending_reservations:pending,
      cancelled_reservations:cancelled,
      non_cancelled_reservations:cancelled === null ? null : created - cancelled,
      online_reservations:online,
      source_detail_available:Boolean(input.source_detail_available),
      attribution_identifiers_available:Boolean(input.attribution_identifiers_available),
      attribution_limit:input.attribution_identifiers_available ? null : 'wix_reservation_records_do_not_support_retroactive_ads_or_ga4_attribution',
      pii_required:false
    }
  };
}

function adapterState() {
  return {
    mode:'aggregate_ground_truth_contract',
    external_call_performed:false,
    wrong_account_allowed:false,
    credentials_required_in_state:false,
    activation_requirement:'authorized direct Wix read access for autonomous refresh; manually verified aggregate evidence may be persisted with provenance'
  };
}

module.exports = { normalizeGroundTruth, adapterState };
