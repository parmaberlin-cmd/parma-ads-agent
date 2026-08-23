const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MAX_RECORDS = 90;
const DEFAULT_TMP_HISTORY = "/tmp/parma-shadow-history.json";
const VOLUME_HISTORY_FILENAME = "parma-shadow-history.json";

function safeCode(value, fallback = null) {
  if (value == null) return fallback;
  return String(value).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80) || fallback;
}

function historyPath(env = process.env) {
  if (env.SHADOW_HISTORY_PATH) return env.SHADOW_HISTORY_PATH;
  if (env.RAILWAY_VOLUME_MOUNT_PATH) {
    return path.join(env.RAILWAY_VOLUME_MOUNT_PATH, VOLUME_HISTORY_FILENAME);
  }
  return DEFAULT_TMP_HISTORY;
}

function historyStorageStatus(env = process.env) {
  const explicitPath = Boolean(env.SHADOW_HISTORY_PATH);
  const railwayVolume = Boolean(env.RAILWAY_VOLUME_MOUNT_PATH);
  const filePath = historyPath(env);
  const ephemeral = filePath.startsWith("/tmp/") || (!explicitPath && !railwayVolume);

  return {
    configured: explicitPath || railwayVolume,
    source: explicitPath ? "explicit_path" : railwayVolume ? "railway_volume" : "default_tmp",
    path_class: ephemeral ? "ephemeral" : "durable_candidate",
    durable: !ephemeral && (explicitPath || railwayVolume),
    writes_allowed: false,
  };
}

function loadHistory(filePath = historyPath()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(records = [], filePath = historyPath(), { maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  const bounded = records.slice(-maxRecords);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(bounded)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, filePath);
  return bounded;
}

function buildSanitizedHistoryRecord({ snapshot = {}, report = {}, generatedAt = new Date().toISOString() } = {}) {
  const priorities = (report.daily_manager?.primary_priorities || []).slice(0, 3);
  const anomalies = (report.anomalies || []).slice(0, 10);
  const events = Array.isArray(snapshot.live_sources?.ga4?.funnel?.event_names)
    ? snapshot.live_sources.ga4.funnel.event_names
    : [];

  return {
    id: generatedAt,
    generated_at: generatedAt,
    data_quality: safeCode(snapshot.data_quality?.confidence, "unknown"),
    attribution_confidence: safeCode(report.conversion_integrity?.confidence, "unknown"),
    conversion_integrity: safeCode(report.conversion_integrity?.status, "unknown"),
    source_health: {
      google: snapshot.live_sources?.google?.access_ok === true,
      ga4: snapshot.live_sources?.ga4?.access_ok === true,
      meta: snapshot.live_sources?.meta?.access_ok === true,
    },
    tracking: {
      reservation_start: events.includes("reservation_start"),
    },
    priority_codes: priorities.map((priority) => safeCode(priority.code, "unknown")),
    anomaly_codes: anomalies.map((anomaly) => safeCode(anomaly.code, "unknown")),
    safety_violation: false,
    outcome: null,
    expected_direction: null,
  };
}

function appendHistoryRecord(records = [], record, { maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  if (!record?.generated_at) return records.slice(-maxRecords);
  return [
    ...records.filter((existing) => existing.generated_at !== record.generated_at),
    record,
  ].slice(-maxRecords);
}

function appendAndPersist({ records = [], record, filePath = historyPath(), maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  return saveHistory(appendHistoryRecord(records, record, { maxRecords }), filePath, { maxRecords });
}

function publicHistorySummary(records = [], storage = {}) {
  const healthyRuns = (source) => records.filter((record) => record.source_health?.[source] === true).length;
  return {
    total_runs: records.length,
    high_data_quality_runs: records.filter((record) => record.data_quality === "high").length,
    source_healthy_runs: {
      google: healthyRuns("google"),
      ga4: healthyRuns("ga4"),
      meta: healthyRuns("meta"),
    },
    reservation_start_tracked_runs: records.filter((record) => record.tracking?.reservation_start === true).length,
    storage: {
      durable: storage.durable === true,
      path_class: storage.path_class || "unknown",
      source: storage.source || "unknown",
    },
    writes_allowed: false,
  };
}

module.exports = {
  DEFAULT_MAX_RECORDS,
  DEFAULT_TMP_HISTORY,
  VOLUME_HISTORY_FILENAME,
  safeCode,
  historyPath,
  historyStorageStatus,
  loadHistory,
  saveHistory,
  buildSanitizedHistoryRecord,
  appendHistoryRecord,
  appendAndPersist,
  publicHistorySummary,
};
