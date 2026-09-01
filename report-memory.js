const { observedNumber } = require('./observed-number');

const ACTION_SOURCES = Object.freeze({
  CHECK_SOURCE_EVIDENCE: ['google', 'ga4', 'meta'],
  RECONCILE_BUSINESS_OUTCOMES: ['google', 'ga4'],
  VERIFY_FUNNEL_MEASUREMENT: ['ga4'],
  DIAGNOSE_META_DELIVERY: ['meta'],
  REVIEW_LOCAL_SEARCH_INTENT: ['google'],
  REVIEW_DEMAND_DISTRIBUTION: ['google'],
  REVIEW_DIRECT_ORDER_EVIDENCE: [],
  VERIFY_ORDER_SIGNALS: ['ga4'],
  CHECK_SEARCH_COLLECTION: ['google'],
});
const METRICS = ['impressions', 'clicks', 'spend_eur', 'conversion_signals'];
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) || day(value.slice(0,10)) === null || Number(value.slice(11,13)) > 23) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}
function period(value = {}) {
  if (!value || day(value.start) === null || day(value.end) === null || day(value.start) > day(value.end)) return null;
  return { start: value.start, end: value.end };
}
function actionCodes(brief = {}) {
  return [...new Set([...(brief.priorities || []), ...(brief.deferred_actions || [])]
    .map(item => item?.code).filter(code => typeof code === 'string' && Object.hasOwn(ACTION_SOURCES, code)))].sort();
}
function safeScope(value) {
  return typeof value === 'string' && /^scope:[a-f0-9]{64}$/.test(value) ? value : null;
}

function buildOperationalCheckpoint({ snapshot = {}, report = {}, generatedAt = new Date().toISOString() } = {}) {
  const brief = report.decision_brief || {};
  const totals = snapshot.live_sources?.google?.totals || {};
  const google = snapshot.live_sources?.google || {};
  const sources = Object.fromEntries(['google', 'ga4', 'meta'].map(name => [name,
    ['fresh', 'unavailable', 'unverified'].includes(brief.source_evidence?.[name]) ? brief.source_evidence[name] : 'unverified']));
  return {
    version: 1,
    generated_at: timestamp(generatedAt) === null ? null : new Date(generatedAt).toISOString(),
    source_evidence: sources,
    priority_codes: actionCodes(brief),
    coverage: {
      direct_orders: brief.direct_orders?.evidence?.fresh === true,
      search_terms: google.search_intelligence_ok === true,
    },
    google: {
      scope: safeScope(google.reporting_scope),
      period: period(google.period),
      // Only same-window revisions are compared. No claim of day-over-day growth.
      metrics: Object.fromEntries(METRICS.map(key => [key,
        sources.google === 'fresh' ? observedNumber(key === 'conversion_signals' ? totals.conversions : totals[key]) : null])),
    },
  };
}

function checkpointValid(value, before) {
  return value?.version === 1 && timestamp(value.generated_at) !== null && timestamp(value.generated_at) < before
    && Array.isArray(value.priority_codes) && value.source_evidence && value.google && value.google.metrics
    && ['google', 'ga4', 'meta'].every(source => ['fresh', 'unavailable', 'unverified'].includes(value.source_evidence[source]));
}
function compareOperationalHistory({ current, history = [], historyHealthy = true, maxGapHours = 48 } = {}) {
  const at = timestamp(current?.generated_at);
  const limitHours = typeof maxGapHours === 'number' && Number.isFinite(maxGapHours) && maxGapHours > 0 ? Math.min(maxGapHours, 168) : 48;
  const empty = {
    status: 'baseline_unavailable', baseline_at: null,
    priorities: { new: [], persistent: [], no_longer_observed: [], unverifiable: [] },
    source_changes: [], metrics: { status: 'not_comparable', reason: 'baseline_unavailable', changes: [] },
    material_change: null, notification_recommended: false,
    writes_allowed: false, notification_sent: false,
  };
  if (!checkpointValid(current, at === null ? 0 : at + 1)) return { ...empty, status: 'current_checkpoint_invalid' };
  if (historyHealthy !== true) return { ...empty, status: 'history_unhealthy' };
  const candidates = (Array.isArray(history) ? history : []).map(record => record?.operational_checkpoint)
    .filter(cp => checkpointValid(cp, at)).sort((a, b) => timestamp(b.generated_at) - timestamp(a.generated_at));
  const previous = candidates[0];
  if (!previous) return empty;
  if (at - timestamp(previous.generated_at) > limitHours * 3600000) return { ...empty, status: 'history_gap' };
  const before = new Set(previous.priority_codes.filter(code => typeof code === 'string' && Object.hasOwn(ACTION_SOURCES, code)));
  const after = new Set(current.priority_codes.filter(code => typeof code === 'string' && Object.hasOwn(ACTION_SOURCES, code)));
  const priorities = {
    new: [...after].filter(code => !before.has(code)),
    persistent: [...after].filter(code => before.has(code)),
    no_longer_observed: [], unverifiable: [],
  };
  for (const code of before) {
    if (after.has(code)) continue;
    let covered = ACTION_SOURCES[code].every(source => current.source_evidence[source] === 'fresh');
    if (code === 'REVIEW_DIRECT_ORDER_EVIDENCE') covered = current.coverage?.direct_orders === true;
    if (['REVIEW_LOCAL_SEARCH_INTENT', 'CHECK_SEARCH_COLLECTION'].includes(code)) covered &&= current.coverage?.search_terms === true;
    priorities[covered ? 'no_longer_observed' : 'unverifiable'].push(code);
  }
  const sourceChanges = ['google', 'ga4', 'meta'].filter(source => previous.source_evidence[source] !== current.source_evidence[source])
    .map(source => ({ source, before: ['fresh', 'unavailable', 'unverified'].includes(previous.source_evidence[source]) ? previous.source_evidence[source] : 'unverified', after: current.source_evidence[source] }));
  const currentPeriod = period(current.google?.period), previousPeriod = period(previous.google?.period);
  let reason = null;
  if (current.source_evidence.google !== 'fresh' || previous.source_evidence.google !== 'fresh') reason = 'source_not_fresh';
  else if (!safeScope(current.google?.scope) || current.google.scope !== safeScope(previous.google?.scope)) reason = 'reporting_scope_unverified_or_changed';
  else if (!currentPeriod || !previousPeriod) reason = 'period_unknown';
  else if (currentPeriod.start !== previousPeriod.start || currentPeriod.end !== previousPeriod.end) reason = 'different_windows_not_a_daily_trend';
  const changes = reason ? [] : METRICS.map(metric => {
    const prior = observedNumber(previous.google.metrics[metric]), value = observedNumber(current.google.metrics[metric]);
    return { metric, before: prior, after: value, delta: prior === null || value === null ? null : Number((value - prior).toFixed(6)) };
  }).filter(row => row.delta !== null && Math.abs(row.delta) > 0.000001);
  const material = priorities.new.length > 0 || priorities.no_longer_observed.length > 0 || priorities.unverifiable.length > 0 || sourceChanges.length > 0 || changes.length > 0;
  return {
    ...empty, status: 'compared', baseline_at: new Date(previous.generated_at).toISOString(), priorities,
    source_changes: sourceChanges,
    metrics: { status: reason ? 'not_comparable' : 'same_window_revision', reason, changes },
    material_change: material, notification_recommended: material,
  };
}

module.exports = { ACTION_SOURCES, METRICS, timestamp, period, buildOperationalCheckpoint, compareOperationalHistory };
