const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeEventDateSemantics } = require("../ga4-event-semantics");

test("summarizes event dates without claiming semantic identity", () => {
  const rows = [
    { dimensionValues: [{ value: "20260802" }, { value: "booking_completed" }, { value: "google" }, { value: "cpc" }], metricValues: [{ value: "4" }, { value: "3" }, { value: "3" }] },
    { dimensionValues: [{ value: "20260802" }, { value: "booking_completed" }, { value: "direct" }, { value: "(none)" }], metricValues: [{ value: "2" }, { value: "2" }, { value: "2" }] },
    { dimensionValues: [{ value: "20260803" }, { value: "table_reservation_completed" }, { value: "google" }, { value: "organic" }], metricValues: [{ value: "1" }, { value: "1" }, { value: "1" }] },
  ];
  const out = summarizeEventDateSemantics(rows, ["booking_completed", "table_reservation_completed"]);
  assert.equal(out.booking_completed.event_count, 6);
  assert.equal(out.booking_completed.google_cpc_event_count, 4);
  assert.equal(out.booking_completed.active_dates, 1);
  assert.equal(out.booking_completed.semantic_identity, "unverified");
  assert.equal(out.booking_completed.attribution_scope, "session_source_medium");
  assert.equal(out.table_reservation_completed.event_count, 1);
});

test("invalid event list fails closed", () => {
  assert.throws(() => summarizeEventDateSemantics([], []), /eventNames/);
});
