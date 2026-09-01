const { observedNumber } = require('./observed-number');
const { assessDirectOrders } = require('./direct-order-readiness');
const { buildOperationalCheckpoint, compareOperationalHistory } = require('./report-memory');
const { diagnoseOrderSignals } = require('./order-signal-diagnostics');
const { selectNextAutonomousAction } = require('./next-action-engine');

// Read-only, allowlisted output. Never echo raw errors, names, URLs or credentials.
function buildDailyDecisionBrief({ input = {}, report = {}, now = new Date() } = {}) {
  const generatedAt = now.toISOString();
  const actions = [];
  const add = (code, priority, action, evidence, hypothesis, blocker = null) => actions.push({
    code, priority, action, evidence, expected_benefit_hypothesis: hypothesis,
    business_effect_verified: false, risk: 'read_only_analysis',
    blocker, autonomous_next_step_available: true,
    requires_authorization: false, executable: false, execution_status: 'not_executed',
  });
  const sources = {};
  for (const source of ['google', 'ga4', 'meta']) {
    const access = input.access?.[`${source}_ok`] ?? input.live_sources?.[source]?.access_ok;
    const freshness = input.data_quality?.sources?.[source]?.state;
    sources[source] = access === true && freshness === 'fresh' ? 'fresh' : access === false ? 'unavailable' : 'unverified';
  }
  const missing = Object.keys(sources).filter((name) => sources[name] !== 'fresh');
  if (missing.length) add('CHECK_SOURCE_EVIDENCE', 100,
    'Inspect sanitized access and collection timestamps; stop at any consent or account-permission gate.',
    { sources: missing }, 'Restore trustworthy diagnostics before interpreting performance.',
    'Live access or freshness is not verified; analysis of existing code remains available.');

  if (report.conversion_integrity?.optimization_allowed !== true) add('RECONCILE_BUSINESS_OUTCOMES', 95,
    'Compare event semantics, exact dates, timezone, attribution and counting; keep orders separate from reservations.',
    { comparison_verified: report.conversion_integrity?.reconciliation?.optimization_allowed === true,
      google_conversion_signals: observedNumber(input.conversions?.google_ads_conversions),
      ga4_session_conversion_signals: observedNumber(input.conversions?.booking_completed) },
    'Avoid optimizing for events that do not represent real customers or orders.',
    'Final business-outcome validation needs provider evidence; temporal and semantic analysis can continue.');

  if (sources.ga4 === 'fresh' && report.funnel?.comparison_verified !== true) add('VERIFY_FUNNEL_MEASUREMENT', 85,
    'Inspect configured and observed funnel events and their populations; do not infer a broken page from zero events.',
    { comparison_verified: false, booking_start_observed: input.funnel?.bookingStartedObserved === true },
    'Locate measurement gaps before proposing changes to the customer journey.');

  const issueCount = observedNumber(input.meta?.campaign_counts?.with_issues);
  if (sources.meta === 'fresh' && issueCount > 0) add('DIAGNOSE_META_DELIVERY', 80,
    'Classify delivery restrictions from sanitized diagnostics without changing billing, account security or delivery.',
    { affected_campaigns: issueCount }, 'Identify why configured campaigns cannot currently deliver.',
    'Billing or security remediation, if required, is a separate human gate.');

  const terms = Array.isArray(input.search_terms) ? input.search_terms.length : 0;
  if (sources.google === 'fresh' && input.live_sources?.google?.search_intelligence_ok === false) add('CHECK_SEARCH_COLLECTION', 90,
    'Inspect the failed search-term sub-collection; successful campaign metrics do not prove the term inventory is complete.',
    { campaign_metrics_available: true, search_collection_complete: false },
    'Avoid interpreting a failed search-term query as absence of customer demand.');
  if (sources.google === 'fresh' && terms > 0) add('REVIEW_LOCAL_SEARCH_INTENT', 75,
    'Group search terms into nearby dining, pickup, delivery and irrelevant intent; prepare proposals only.',
    { observed_terms: terms }, 'Find opportunities to attract nearby customers to direct orders without auto-excluding terms.');

  const clicks = observedNumber(input.live_sources?.google?.totals?.clicks);
  if (sources.google === 'fresh' && clicks !== null) add('REVIEW_DEMAND_DISTRIBUTION', 65,
    'Read available geographic, device and hourly breakdowns; mark unavailable dimensions instead of estimating them.',
    { observed_clicks: clicks }, 'Identify where and when local demand may be captured with existing delivery.');

  const directOrders = input.direct_orders === undefined ? null : assessDirectOrders(input.direct_orders, { now: generatedAt });
  const orderSignals = diagnoseOrderSignals(input.live_sources?.ga4 || {}, { fresh: sources.ga4 === 'fresh' });
  if (sources.ga4 === 'fresh') add('VERIFY_ORDER_SIGNALS', 84,
    'Inspect order-related event candidates already returned by GA4; reconcile completion signals with real provider orders.',
    { candidate_count: orderSignals.candidates.length, completion_candidates_overlap: orderSignals.parallel_completion_candidates },
    'Separate direct-order intent from reservation and checkout events before measuring customer acquisition.',
    'Real order count and revenue require provider reconciliation; event-inventory analysis is available now.');
  if (directOrders) add('REVIEW_DIRECT_ORDER_EVIDENCE', 70,
    'Review dated ordering-path observations and provider measurement; a reachable checkout is not a completed order.',
    { ready_for_optimization_review: directOrders.ready_for_order_optimization_review === true },
    'Prepare a measurable direct-order objective without confusing navigation with revenue.');

  actions.sort((a, b) => b.priority - a.priority || a.code.localeCompare(b.code));
  const brief = {
    version: 1, generated_at: generatedAt, mode: 'shadow',
    objective: 'verified_nearby_customers_and_direct_orders',
    source_evidence: sources,
    priorities: actions.slice(0, 5), deferred_actions: actions.slice(5),
    next_autonomous_action: actions[0]?.code || null,
    direct_orders: directOrders,
    order_signals: orderSignals,
    writes_allowed: false, spend_authorized: false,
    tracking_mutation_authorized: false, deploy_authorized: false,
  };
  brief.changes = compareOperationalHistory({
    current: buildOperationalCheckpoint({ snapshot: input, report: { decision_brief: brief }, generatedAt }),
    history: input.previous_history || [], historyHealthy: input.history_healthy !== false,
  });
  if (Array.isArray(input.work_queue)) {
    const queue = selectNextAutonomousAction(input.work_queue, { now });
    brief.engineering_queue = {
      status: queue.status, eligible_count: queue.eligible_count,
      selected_id: queue.selected?.id || null, selected_operation: queue.selected?.operation || null,
      excluded_count: queue.excluded.length, execution_authorized: false,
    };
  }
  return brief;
}

module.exports = { buildDailyDecisionBrief };
