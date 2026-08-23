const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildSanitizedHistoryRecord,
  appendHistoryRecord,
  saveHistory,
  loadHistory,
  loadHistoryState,
  publicHistorySummary,
  historyPath,
  historyStorageStatus,
} = require("../shadow-history-store");

test("history record contains only sanitized health and codes", () => {
  const record = buildSanitizedHistoryRecord({
    snapshot: {
      data_quality: { confidence: "high" },
      live_sources: {
        google: { access_ok: false },
        ga4: { access_ok: true, funnel: { event_names: ["reservation_start", "booking_completed"] } },
        meta: { access_ok: true },
      },
    },
    report: {
      conversion_integrity: { confidence: "high", status: "healthy" },
      daily_manager: { primary_priorities: [{ code: "A 1" }] },
      anomalies: [{ code: "B/2" }],
    },
    generatedAt: "2026-08-23T12:00:00Z",
  });
  const text = JSON.stringify(record);
  assert.equal(record.priority_codes[0], "A_1");
  assert.equal(record.anomaly_codes[0], "B_2");
  assert.equal(record.tracking.reservation_start, true);
  assert.equal(text.includes("token"), false);
  assert.equal(text.includes("campaign_id"), false);
});

test("history is bounded and deduplicated", () => {
  let records = [];
  for (let index = 0; index < 5; index += 1) {
    records = appendHistoryRecord(records, { generated_at: String(index) }, { maxRecords: 3 });
  }
  assert.deepEqual(records.map((record) => record.generated_at), ["2", "3", "4"]);
  records = appendHistoryRecord(records, { generated_at: "4", x: 1 }, { maxRecords: 3 });
  assert.equal(records.length, 3);
  assert.equal(records[2].x, 1);
});

test("history persists with owner-only file mode and verified reload", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-history-"));
  const file = path.join(directory, "history.json");
  saveHistory([{ generated_at: "x", source_health: { google: true } }], file);
  assert.equal(loadHistory(file).length, 1);
  assert.equal(loadHistoryState(file).healthy, true);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("missing history file is healthy empty state, not corruption", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-history-missing-"));
  const state = loadHistoryState(path.join(directory, "missing.json"));
  assert.equal(state.healthy, true);
  assert.equal(state.exists, false);
  assert.deepEqual(state.records, []);
});

test("malformed JSON is reported unhealthy and loads no records", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-history-corrupt-"));
  const file = path.join(directory, "history.json");
  fs.writeFileSync(file, "{not-json", { mode: 0o600 });
  const state = loadHistoryState(file);
  assert.equal(state.healthy, false);
  assert.equal(state.exists, true);
  assert.equal(state.reason, "history_parse_failed");
  assert.deepEqual(state.records, []);
});

test("structurally invalid history is reported unhealthy", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-history-invalid-"));
  const file = path.join(directory, "history.json");
  fs.writeFileSync(file, JSON.stringify([{ source_health: {} }]), { mode: 0o600 });
  const state = loadHistoryState(file);
  assert.equal(state.healthy, false);
  assert.equal(state.reason, "history_record_invalid");
});

test("default tmp history is classified ephemeral and cannot support promotion", () => {
  const status = historyStorageStatus({});
  assert.equal(status.durable, false);
  assert.equal(status.path_class, "ephemeral");
  assert.equal(status.source, "default_tmp");
  assert.equal(status.writes_allowed, false);
});

test("explicit non-tmp history path is a durable candidate", () => {
  const status = historyStorageStatus({ SHADOW_HISTORY_PATH: "/data/parma-shadow-history.json" });
  assert.equal(status.configured, true);
  assert.equal(status.durable, true);
  assert.equal(status.path_class, "durable_candidate");
  assert.equal(status.source, "explicit_path");
});

test("Railway volume mount is automatically used as durable candidate", () => {
  const env = { RAILWAY_VOLUME_MOUNT_PATH: "/data" };
  assert.equal(historyPath(env), "/data/parma-shadow-history.json");
  const status = historyStorageStatus(env);
  assert.equal(status.configured, true);
  assert.equal(status.durable, true);
  assert.equal(status.path_class, "durable_candidate");
  assert.equal(status.source, "railway_volume");
  assert.equal(status.writes_allowed, false);
});

test("explicit history path takes precedence over Railway volume mount", () => {
  const env = { SHADOW_HISTORY_PATH: "/custom/history.json", RAILWAY_VOLUME_MOUNT_PATH: "/data" };
  assert.equal(historyPath(env), "/custom/history.json");
  assert.equal(historyStorageStatus(env).source, "explicit_path");
});

test("public summary reports storage health without exposing a path", () => {
  const summary = publicHistorySummary([
    { data_quality: "high", source_health: { google: true, ga4: true, meta: true }, tracking: { reservation_start: true } },
  ], { durable: true, healthy: false, reason: "history_parse_failed", path_class: "durable_candidate", source: "railway_volume" });
  assert.equal(summary.total_runs, 1);
  assert.equal(summary.storage.durable, true);
  assert.equal(summary.storage.healthy, false);
  assert.equal(summary.storage.reason, "history_parse_failed");
  assert.equal(summary.storage.path, undefined);
  assert.equal(summary.writes_allowed, false);
});
