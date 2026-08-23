const test = require("node:test");
const assert = require("node:assert/strict");
const { createShadowHistoryStore, recordFromShadowResult } = require("../shadow-history");

function sampleResult() {
  return {
    generated_at: "2026-08-23T18:00:00.000Z",
    data_quality: { confidence: "high" },
    conversion_integrity: { confidence: "medium" },
    live_sources: {
      google: { access_ok: false },
      ga4: { access_ok: true },
      meta: { access_ok: true },
    },
  };
}

test("real collection becomes non-evaluable history without invented outcomes", () => {
  const record = recordFromShadowResult(sampleResult());
  assert.equal(record.outcome, null);
  assert.equal(record.expected_direction, null);
  assert.equal(record.before, null);
  assert.equal(record.after, null);
  assert.equal(record.safety_violation, false);
  assert.deepEqual(record.source_health, { google: false, ga4: true, meta: true });
});

test("history store is bounded and returns copies", () => {
  const store = createShadowHistoryStore({ maxRecords: 2 });
  store.append({ id: "a" });
  store.append({ id: "b" });
  store.append({ id: "c" });
  const records = store.list();
  assert.deepEqual(records.map((record) => record.id), ["b", "c"]);
  records[0].source_health.google = true;
  assert.equal(store.list()[0].source_health.google, false);
});
