const test = require("node:test");
const assert = require("node:assert/strict");
const { assessDirectOrders } = require("../direct-order-readiness");
const { buildDailyShadowReport } = require("../daily-shadow-report");
const NOW = new Date("2026-09-01T17:30:00Z");
function evidence() {
  return {
    observed_at: "2026-09-01T17:26:00Z", source: "rendered_browser",
    url: "https://www.parmaberlin.de/online-ordering",
    page: { render_complete: true, accepting_orders: true, product_count: 29,
      pickup_available: true, delivery_available: null, product_dialog_opened: true,
      add_to_cart_enabled: true, checkout_reached: null },
  };
}
const assess = (input) => assessDirectOrders(input, { now: NOW });
const has = (r, code) => r.findings.some(x => x.code === code);

test("missing evidence means unknown, not closed or zero orders", () => {
  const r = assess();
  assert.equal(r.journey.status, "unverified");
  assert.equal(r.journey.facts.product_count, null);
  assert.equal(has(r, "ORDER_PATH_UNAVAILABLE"), false);
  assert.equal(r.ready_for_order_optimization_review, false);
});
test("rendered pickup selection is not a completed checkout", () => {
  const r = assess(evidence());
  assert.equal(r.journey.status, "product_selection_verified");
  assert.equal(r.journey.facts.delivery_available, null);
  assert.equal(r.journey.payment_and_order_receipt_verified, false);
  assert.equal(has(r, "ORDER_CHECKOUT_UNVERIFIED"), true);
  assert.equal(r.measurement.status, "unverified");
});
test("empty sections alongside products do not mean empty menu", () => {
  const e = evidence(); e.page.empty_sections_visible = true; e.page.duplicate_sections_visible = true;
  const r = assess(e);
  assert.equal(has(r, "ORDER_EMPTY_SECTIONS"), true);
  assert.equal(has(r, "ORDER_DUPLICATE_SECTIONS"), true);
  assert.equal(has(r, "ORDER_PATH_UNAVAILABLE"), false);
});
test("crawler placeholders cannot prove outage", () => {
  const e = evidence(); e.source = "search_index"; e.page.product_count = 0; e.page.accepting_orders = false;
  const r = assess(e);
  assert.equal(r.journey.status, "unverified");
  assert.equal(has(r, "ORDER_PATH_UNAVAILABLE"), false);
});
test("loading snapshots cannot prove outage", () => {
  const e = evidence(); e.page.render_complete = false; e.page.product_count = 0;
  assert.equal(assess(e).journey.status, "unverified");
});
for (const date of [undefined, "bad", "2026-08-31T12:00:00Z", "2026-09-01T17:31:00Z", "2026-09-01T17:26:00"]) {
  test(`invalid or stale observation fails closed: ${date}`, () => {
    const e = evidence(); e.observed_at = date;
    const r = assess(e);
    assert.equal(r.evidence.fresh, false);
    assert.equal(r.journey.status, "unverified");
  });
}
for (const url of ["http://www.parmaberlin.de/online-ordering", "https://parmaberlin.de.evil.test/online-ordering", "https://www.parmaberlin.de/reservations", "https://user:secret@www.parmaberlin.de/online-ordering", "https://www.parmaberlin.de:444/online-ordering"]) {
  test(`rejects inappropriate evidence destination: ${url.split('@').pop()}`, () => {
    const e = evidence(); e.url = url;
    assert.equal(assess(e).evidence.rendered_page_verified, false);
  });
}
test("observed unavailability is scoped to observation, not a proven root cause", () => {
  for (const patch of [{ accepting_orders: false }, { product_count: 0 }, { pickup_available: false, delivery_available: false }, { add_to_cart_enabled: false }, { checkout_reached: false }]) {
    const e = evidence(); Object.assign(e.page, patch);
    const r = assess(e);
    assert.equal(r.journey.status, "unavailable_in_observation");
    assert.equal(has(r, "ORDER_PATH_UNAVAILABLE"), true);
  }
});
test("malformed booleans and counts are not accepted as evidence", () => {
  for (const value of ["29", "", false, -1, 0.5, Infinity, NaN, null]) {
    const e = evidence(); e.page.product_count = value;
    assert.equal(assess(e).journey.facts.product_count, null);
  }
  const e = evidence(); e.page.accepting_orders = "true";
  assert.equal(assess(e).journey.status, "unverified");
});
test("home CTA findings need independent fresh homepage evidence", () => {
  const e = evidence();
  e.home = { observed_at: e.observed_at, source: e.source, url: "https://www.parmaberlin.de/",
    render_complete: true, primary_order_cta_direct: false, menu_link_self: true };
  assert.equal(has(assess(e), "HOME_DIRECT_ORDER_CTA_MISSING"), true);
  assert.equal(has(assess(e), "HOME_MENU_LINK_SELF"), true);
  e.home.url = "https://other.example/";
  assert.equal(has(assess(e), "HOME_DIRECT_ORDER_CTA_MISSING"), false);
  e.home.url = "https://www.parmaberlin.de/"; e.home.observed_at = "2020-01-01T00:00:00Z";
  assert.equal(has(assess(e), "HOME_DIRECT_ORDER_CTA_MISSING"), false);
});
test("booking and purchase event names/counts do not establish an order outcome", () => {
  const e = evidence(); e.measurement = { booking_completed: 927, purchase: 100, table_reservation_completed: 11 };
  assert.equal(assess(e).measurement.status, "unverified");
});
test("recent verified order semantics enable review only, never execution", () => {
  const e = evidence(); e.page.checkout_reached = true;
  e.measurement = { order_outcome: { business_type: "online_order", provider_reconciled: true,
    event_semantics_verified: true, deduplication_verified: true, verified_at: e.observed_at } };
  const r = assess(e);
  assert.equal(r.ready_for_order_optimization_review, true);
  assert.equal(r.executable, false); assert.equal(r.writes_allowed, false); assert.equal(r.spend_authorized, false);
  for (const field of ["provider_reconciled", "event_semantics_verified", "deduplication_verified"]) {
    const copy = structuredClone(e); copy.measurement.order_outcome[field] = false;
    assert.equal(assess(copy).ready_for_order_optimization_review, false);
  }
  e.measurement.order_outcome.business_type = "table_reservation";
  assert.equal(assess(e).ready_for_order_optimization_review, false);
  e.measurement.order_outcome.business_type = "online_order";
  e.measurement.order_outcome.verified_at = "2026-08-01T00:00:00Z";
  assert.equal(assess(e).ready_for_order_optimization_review, false);
});
test("input secrets and URL parameters are never reflected", () => {
  const e = evidence(); const marker = "DO_NOT_OUTPUT_CUSTOMER_OR_SECRET";
  e.url += `?token=${marker}#${marker}`;
  e.api_key = marker; e.customer = marker; e.page.note = marker;
  e.measurement = { event_name: marker }; e.source = marker;
  const before = structuredClone(e); const r = assess(e);
  assert.equal(JSON.stringify(r).includes(marker), false);
  assert.deepEqual(e, before);
});
test("null/array inputs and invalid clock fail closed without throwing", () => {
  for (const value of [null, [], "text", 42]) assert.equal(assess(value).journey.status, "unverified");
  assert.equal(assessDirectOrders(evidence(), { now: new Date(NaN) }).ready_for_order_optimization_review, false);
});
test("daily report supports orders separately without changing existing channels", () => {
  const base = buildDailyShadowReport({ google: { cost: 10, clicks: 5, bookings: 2 } });
  const withOrders = buildDailyShadowReport({ google: { cost: 10, clicks: 5, bookings: 2 }, direct_orders: evidence() });
  assert.equal("direct_orders" in base, false);
  assert.deepEqual(withOrders.channels, base.channels);
  assert.equal(withOrders.direct_orders.executable, false);
  assert.equal(withOrders.writes_allowed, false);
});
