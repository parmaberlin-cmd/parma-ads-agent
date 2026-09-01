const fs = require("node:fs");
const path = require("node:path");
const { buildOperationalCheckpoint } = require('./report-memory');

const DEFAULT_MAX_RECORDS = 90;
const DEFAULT_TMP_HISTORY = "/tmp/parma-shadow-history.json";
const VOLUME_HISTORY_FILENAME = "parma-shadow-history.json";

function safeCode(value, fallback = null) {
  if (value == null) return fallback;
  return String(value).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80) || fallback;
}

function historyPath(env = process.env) {
  if (env.SHADOW_HISTORY_PATH) return env.SHADOW_HISTORY_PATH;
  if (env.RAILWAY_VOLUME_MOUNT_PATH) return path.join(env.RAILWAY_VOLUME_MOUNT_PATH, VOLUME_HISTORY_FILENAME);
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

function validateLoadedRecords(parsed) {
  if (!Array.isArray(parsed)) return { healthy: false, records: [], reason: "history_not_array" };
  const invalid = parsed.some((record) => !record || typeof record !== "object" || !record.generated_at);
  if (invalid) return { healthy: false, records: [], reason: "history_record_invalid" };
  return { healthy: true, records: parsed, reason: null };
}

function loadHistoryState(filePath = historyPath()) {
  if (!fs.existsSync(filePath)) return { healthy: true, exists: false, records: [], reason: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const validated = validateLoadedRecords(parsed);
    return { ...validated, exists: true };
  } catch {
    return { healthy: false, exists: true, records: [], reason: "history_parse_failed" };
  }
}

function loadHistory(filePath = historyPath()) {
  return loadHistoryState(filePath).records;
}

function saveHistory(records = [], filePath = historyPath(), { maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  const bounded = records.slice(-maxRecords);
  fs.mkdirSync(path.dirname(filePath), { recursive:true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(bounded)}\n`, { mode:0o600 });
  fs.renameSync(tmp, filePath);
  const verified = loadHistoryState(filePath);
  if (!verified.healthy || verified.records.length !== bounded.length) throw new Error("shadow_history_persistence_verification_failed");
  return bounded;
}

function observedGa4Event(snapshot = {}, eventName) {
  const explicit = snapshot.live_sources?.ga4?.funnel?.completeness?.tracking?.[eventName];
  if (explicit && typeof explicit.observed === "boolean") return explicit.observed;
  const count = Number(snapshot.live_sources?.ga4?.funnel?.totals?.[eventName] || 0);
  return Number.isFinite(count) && count > 0;
}

function buildSanitizedHistoryRecord({ snapshot = {}, report = {}, generatedAt = new Date().toISOString() } = {}) {
  const priorities = (report.decision_brief?.priorities || report.daily_manager?.primary_priorities || []).slice(0,5);
  const anomalies = (report.anomalies || []).slice(0,10);
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
      reservation_page_view: observedGa4Event(snapshot, "reservation_page_view"),
      reservation_start: observedGa4Event(snapshot, "reservation_start"),
      booking_completed: observedGa4Event(snapshot, "booking_completed"),
    },
    priority_codes: priorities.map((priority) => safeCode(priority.code, "unknown")),
    anomaly_codes: anomalies.map((anomaly) => safeCode(anomaly.code, "unknown")),
    safety_violation:false,
    outcome:null,
    expected_direction:null,
    operational_checkpoint: buildOperationalCheckpoint({ snapshot, report, generatedAt }),
  };
}

function appendHistoryRecord(records = [], record, { maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  if (!record?.generated_at) return records.slice(-maxRecords);
  return [...records.filter((existing) => existing.generated_at !== record.generated_at), record].slice(-maxRecords);
}

function appendAndPersist({ records = [], record, filePath = historyPath(), maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  return saveHistory(appendHistoryRecord(records, record, { maxRecords }), filePath, { maxRecords });
}

function publicHistorySummary(records = [], storage = {}) {
  const healthyRuns = (source) => records.filter((record) => record.source_health?.[source] === true).length;
  return {
    total_runs: records.length,
    high_data_quality_runs: records.filter((record) => record.data_quality === "high").length,
    source_healthy_runs: { google:healthyRuns("google"), ga4:healthyRuns("ga4"), meta:healthyRuns("meta") },
    reservation_start_observed_runs: records.filter((record) => record.tracking?.reservation_start === true).length,
    storage: {
      durable: storage.durable === true,
      healthy: storage.healthy === true,
      path_class: storage.path_class || "unknown",
      source: storage.source || "unknown",
      reason: storage.reason || null,
    },
    writes_allowed:false,
  };
}

module.exports = {
  DEFAULT_MAX_RECORDS, DEFAULT_TMP_HISTORY, VOLUME_HISTORY_FILENAME,
  safeCode, historyPath, historyStorageStatus, validateLoadedRecords, loadHistoryState, loadHistory, saveHistory,
  observedGa4Event, buildSanitizedHistoryRecord, appendHistoryRecord, appendAndPersist, publicHistorySummary,
};
