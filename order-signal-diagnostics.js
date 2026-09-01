const { observedNumber } = require('./observed-number');

const ORDER_EVENTS = Object.freeze({
  view_item: 'product_view', add_to_cart: 'cart', begin_checkout: 'checkout',
  purchase: 'completion_candidate', order_completed: 'completion_candidate',
  checkout_completed: 'completion_candidate', refund: 'reversal_candidate',
});

// Event names are hypotheses about meaning, never business ground truth.
function summarizeOrderInventory(rows = []) {
  const counts = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = row.dimensionValues?.[0]?.value;
    if (typeof name !== 'string' || !Object.hasOwn(ORDER_EVENTS, name)) continue;
    const count = observedNumber(row.metricValues?.[0]?.value);
    const previous = counts.get(name);
    counts.set(name, { event_name: name, stage: ORDER_EVENTS[name], event_count: previous ? null : count, ambiguous_rows: Boolean(previous) });
  }
  return [...counts.values()].sort((a, b) => a.event_name.localeCompare(b.event_name));
}

function diagnoseOrderSignals(ga4 = {}, { fresh = false } = {}) {
  const available = ga4.access_ok === true && fresh === true;
  const inventory = ga4.event_inventory;
  const inputRows = available && Array.isArray(inventory?.order_candidates) ? inventory.order_candidates : [];
  const seen = new Set();
  const candidates = [];
  for (const row of inputRows) {
    if (!row || typeof row.event_name !== 'string' || !Object.hasOwn(ORDER_EVENTS, row.event_name) || seen.has(row.event_name)) continue;
    seen.add(row.event_name);
    candidates.push({ event_name: row.event_name, stage: ORDER_EVENTS[row.event_name],
      event_count: row.ambiguous_rows === true ? null : observedNumber(row.event_count),
      ambiguous_rows: row.ambiguous_rows === true });
  }
  const observed = candidates.filter(row => row.event_count > 0);
  const completion = observed.filter(row => row.stage === 'completion_candidate');
  const coverage = available && inventory ? 'limited_event_inventory' : 'unavailable';
  return {
    status: !available ? 'source_unverified' : !inventory ? 'inventory_unavailable' : observed.length ? 'candidate_signals_observed' : 'no_candidates_in_returned_inventory',
    coverage, candidates,
    observed_stages: [...new Set(observed.map(row => row.stage))].sort(),
    parallel_completion_candidates: completion.length > 1,
    duplicate_orders_proven: false,
    verified_orders: null, verified_revenue: null,
    reservation_events_excluded: true,
    absence_proves_no_orders: false,
    optimization_allowed: false, writes_allowed: false,
    next_step: completion.length ? 'reconcile_completion_candidates_with_provider_and_deduplication' : 'inspect_order_event_configuration_without_changing_tracking',
  };
}

module.exports = { ORDER_EVENTS, summarizeOrderInventory, diagnoseOrderSignals };
