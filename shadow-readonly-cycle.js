const { buildDailyOperationalSummary } = require('./shadow-operations');
const { publicHistorySummary } = require('./shadow-history-store');

const STAGES = Object.freeze(['collect','validate','analyze','detect','prioritize','report','history']);

function sourceStatus(snapshot = {}) {
  return {
    google: snapshot.live_sources?.google?.access_ok === true,
    ga4: snapshot.live_sources?.ga4?.access_ok === true,
    meta: snapshot.live_sources?.meta?.access_ok === true,
  };
}

function buildReadonlyCycleState({ snapshot = {}, report = {}, history = [], now = new Date() } = {}) {
  const quality = snapshot.data_quality || {};
  const sources = sourceStatus(snapshot);
  const validationPassed = quality.integrity_ok === true && quality.confidence !== 'blocked';
  const operational = buildDailyOperationalSummary({ snapshot, shadowReport: report, lastRunAt: snapshot.now || now.toISOString() });
  const priorities = report.daily_manager?.primary_priorities || report.top_priorities || [];
  const anomalies = report.anomalies || [];
  const historySummary = publicHistorySummary(history);
  const stages = {
    collect: { complete: Boolean(snapshot.now || snapshot.live_sources), sources },
    validate: { complete: true, passed: validationPassed, confidence: quality.confidence || 'unknown', blockers: quality.blockers || [] },
    analyze: { complete: Boolean(report.conversion_integrity || report.executive || report.mode), conversion_integrity: report.conversion_integrity?.status || 'unknown' },
    detect: { complete: true, anomaly_count: anomalies.length },
    prioritize: { complete: true, priority_count: priorities.length },
    report: { complete: true, status: operational.status },
    history: { complete: true, total_runs: historySummary.total_runs },
  };
  const blockedStages = STAGES.filter((stage) => stages[stage]?.complete !== true || (stage === 'validate' && stages.validate.passed !== true));
  return {
    mode: 'shadow',
    generated_at: now.toISOString(),
    stages,
    blocked_stages: blockedStages,
    completed_stages: STAGES.filter((stage) => !blockedStages.includes(stage)),
    operational,
    history: historySummary,
    writes_allowed: false,
    execution_allowed: false,
    spend_allowed: false,
  };
}

function assertReadonlyCycleSafe(cycle = {}) {
  if (cycle.writes_allowed !== false || cycle.execution_allowed !== false || cycle.spend_allowed !== false) {
    throw new Error('readonly cycle safety contract violated');
  }
  return true;
}

module.exports = { STAGES, sourceStatus, buildReadonlyCycleState, assertReadonlyCycleSafe };