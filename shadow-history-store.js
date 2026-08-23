const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_RECORDS = 90;

function safeCode(value, fallback = null) {
  if (value == null) return fallback;
  return String(value).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80) || fallback;
}

function historyPath(env = process.env) {
  return env.SHADOW_HISTORY_PATH || '/tmp/parma-shadow-history.json';
}

function loadHistory(filePath = historyPath()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(records = [], filePath = historyPath(), { maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  const bounded = records.slice(-maxRecords);
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(bounded)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  return bounded;
}

function buildSanitizedHistoryRecord({ snapshot = {}, report = {}, generatedAt = new Date().toISOString() } = {}) {
  const priorities = (report.daily_manager?.primary_priorities || []).slice(0, 3);
  const anomalies = (report.anomalies || []).slice(0, 10);
  return {
    id: generatedAt,
    generated_at: generatedAt,
    data_quality: safeCode(snapshot.data_quality?.confidence, 'unknown'),
    attribution_confidence: safeCode(report.conversion_integrity?.confidence, 'unknown'),
    conversion_integrity: safeCode(report.conversion_integrity?.status, 'unknown'),
    source_health: {
      google: snapshot.live_sources?.google?.access_ok === true,
      ga4: snapshot.live_sources?.ga4?.access_ok === true,
      meta: snapshot.live_sources?.meta?.access_ok === true,
    },
    tracking: {
      reservation_start: Array.isArray(snapshot.live_sources?.ga4?.funnel?.event_names)
        ? snapshot.live_sources.ga4.funnel.event_names.includes('reservation_start')
        : false,
    },
    priority_codes: priorities.map((priority) => safeCode(priority.code, 'unknown')),
    anomaly_codes: anomalies.map((anomaly) => safeCode(anomaly.code, 'unknown')),
    safety_violation: false,
    outcome: null,
    expected_direction: null,
  };
}

function appendHistoryRecord(records = [], record, { maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  if (!record || !record.generated_at) return records.slice(-maxRecords);
  const deduped = records.filter((item) => item.generated_at !== record.generated_at);
  return [...deduped, record].slice(-maxRecords);
}

function appendAndPersist({ records = [], record, filePath = historyPath(), maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  const next = appendHistoryRecord(records, record, { maxRecords });
  return saveHistory(next, filePath, { maxRecords });
}

function publicHistorySummary(records = []) {
  const sourceHealthy = (source) => records.filter((record) => record.source_health?.[source] === true).length;
  return {
    total_runs: records.length,
    high_data_quality_runs: records.filter((record) => record.data_quality === 'high').length,
    source_healthy_runs: {
      google: sourceHealthy('google'),
      ga4: sourceHealthy('ga4'),
      meta: sourceHealthy('meta'),
    },
    reservation_start_tracked_runs: records.filter((record) => record.tracking?.reservation_start === true).length,
    writes_allowed: false,
  };
}

module.exports = {
  DEFAULT_MAX_RECORDS,
  safeCode,
  historyPath,
  loadHistory,
  saveHistory,
  buildSanitizedHistoryRecord,
  appendHistoryRecord,
  appendAndPersist,
  publicHistorySummary,
};