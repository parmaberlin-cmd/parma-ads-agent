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
  publicHistorySummary,
  historyPath,
  historyStorageStatus,
} = require("../shadow-history-store");

test("history record contains only sanitized health and observed tracking", () => {
  const record = buildSanitizedHistoryRecord({
    snapshot: {
      data_quality: { confidence: "high" },
      live_sources: {
        google: { access_ok: false },
        ga4: { access_ok: true, funnel: { event_names: ["reservation_start", "booking_completed"], totals: { reservation_start: 0, booking_completed: 2 } } },
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
  assert.equal(record.tracking.reservation_start, false);
  assert.equal(record.tracking.booking_completed, true);
  assert.equal(text.includes("token"), false);
  assert.equal(text.includes("campaign_id"), false);
});

test("history is bounded and deduplicated", () => {
  let records = [];
  for (let index = 0; index < 5; index += 1) records = appendHistoryRecord(records, { generated_at: String(index) }, { maxRecords: 3 });
  assert.deepEqual(records.map((record) => record.generated_at), ["2", "3", "4"]);
  records = appendHistoryRecord(records, { generated_at: "4", x: 1 }, { maxRecords: 3 });
  assert.equal(records.length, 3);
  assert.equal(records[2].x, 1);
});

test("history persists with owner-only file mode and loads safely", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-history-"));
  const file = path.join(directory, "history.json");
  saveHistory([{ generated_at: "x", source_health: { google: true } }], file);
  assert.equal(loadHistory(file).length, 1);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
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

test("public summary reports observed reservation-start runs and durability without exposing a path", () => {
  const summary = publicHistorySummary([
    { data_quality: "high", source_health: { google: true, ga4: true, meta: true }, tracking: { reservation_start: true } },
  ], { durable: true, path_class: "durable_candidate", source: "railway_volume" });
  assert.equal(summary.total_runs, 1);
  assert.equal(summary.reservation_start_observed_runs, 1);
  assert.equal(summary.storage.durable, true);
  assert.equal(summary.storage.path_class, "durable_candidate");
  assert.equal(summary.storage.source, "railway_volume");
  assert.equal(summary.storage.path, undefined);
  assert.equal(summary.writes_allowed, false);
});