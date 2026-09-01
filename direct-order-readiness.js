// Evidence-only diagnostics. No network, credentials, customer records or mutations.
// Callers must supply observations from a rendered page, not crawler placeholders.
const ORDER_URL = "https://www.parmaberlin.de/online-ordering";
const MAX_AGE_MS = 60 * 60 * 1000;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function tri(value) {
  return typeof value === "boolean" ? value : null;
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function timestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? Date.parse(value) : NaN;
}

function targetMatches(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      ["parmaberlin.de", "www.parmaberlin.de"].includes(url.hostname) &&
      !url.port && url.pathname.replace(/\/$/, "") === "/online-ordering";
  } catch { return false; }
}

function homeMatches(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["parmaberlin.de", "www.parmaberlin.de"].includes(url.hostname) && url.pathname === "/";
  } catch { return false; }
}

function assessDirectOrders(input = {}, { now = new Date() } = {}) {
  const evidence = record(input);
  const page = record(evidence.page);
  const home = record(evidence.home);
  const measurement = record(evidence.measurement);
  const nowMs = now instanceof Date ? now.getTime() : timestamp(now);
  const observedMs = timestamp(evidence.observed_at);
  const age = nowMs - observedMs;
  const fresh = Number.isFinite(age) && age >= 0 && age <= MAX_AGE_MS;
  const trusted = fresh && evidence.source === "rendered_browser" &&
    targetMatches(evidence.url) && page.render_complete === true;
  const findings = [];
  const add = (code, severity, reason, nextStep) => findings.push({
    code, severity, reason, next_step: nextStep, executable: false,
  });

  if (!fresh) add("ORDER_EVIDENCE_NOT_FRESH", "high",
    "Order availability evidence is missing, invalid, future-dated or older than one hour.",
    "Read the public ordering page again; do not infer a live outage from old evidence.");
  if (evidence.source !== "rendered_browser" || !targetMatches(evidence.url) || page.render_complete !== true)
    add("ORDER_PAGE_NOT_VERIFIED", "high",
      "The rendered direct-order page has not been verified on the intended domain.",
      "Inspect the fully rendered public page; search snippets and loading placeholders are not availability checks.");

  // Allowlisted facts only: arbitrary URLs, notes, tokens and customer fields never leave this module.
  const facts = {
    accepting_orders: trusted ? tri(page.accepting_orders) : null,
    product_count: trusted ? count(page.product_count) : null,
    pickup_available: trusted ? tri(page.pickup_available) : null,
    delivery_available: trusted ? tri(page.delivery_available) : null,
    product_dialog_opened: trusted ? tri(page.product_dialog_opened) : null,
    add_to_cart_enabled: trusted ? tri(page.add_to_cart_enabled) : null,
    checkout_reached: trusted ? tri(page.checkout_reached) : null,
  };
  const knownUnavailable = facts.accepting_orders === false || facts.product_count === 0 ||
    (facts.pickup_available === false && facts.delivery_available === false) ||
    facts.add_to_cart_enabled === false || facts.checkout_reached === false;
  const selectable = trusted && facts.accepting_orders === true && facts.product_count > 0 &&
    (facts.pickup_available === true || facts.delivery_available === true) &&
    facts.product_dialog_opened === true && facts.add_to_cart_enabled === true;
  const journeyStatus = knownUnavailable ? "unavailable_in_observation" :
    selectable && facts.checkout_reached === true ? "checkout_reachable" :
    selectable ? "product_selection_verified" : "unverified";

  if (knownUnavailable) add("ORDER_PATH_UNAVAILABLE", "high",
    "At least one required ordering step was explicitly unavailable in this observation; the cause is not established.",
    "Check the affected step and opening/collection schedule before proposing traffic to it.");
  if (trusted && !knownUnavailable && !selectable) add("ORDER_SELECTION_UNVERIFIED", "high",
    "There is not enough evidence that a visitor can select an orderable product.",
    "Verify products, collection/delivery availability and the product dialog without submitting an order.");
  if (trusted && facts.checkout_reached === null) add("ORDER_CHECKOUT_UNVERIFIED", "medium",
    "Opening a product dialog does not verify checkout, payment or order receipt.",
    "Prepare a controlled checkout check; never submit a real order or payment without explicit approval.");
  if (trusted && page.empty_sections_visible === true && facts.product_count > 0)
    add("ORDER_EMPTY_SECTIONS", "medium", "Empty sections are displayed alongside orderable products.",
      "Prepare a cleanup of empty sections; do not describe the entire menu as empty.");
  if (trusted && page.duplicate_sections_visible === true)
    add("ORDER_DUPLICATE_SECTIONS", "low", "Repeated menu sections were observed.",
      "Review menu structure and prepare a simplified direct-order page.");

  // Homepage observations need their own provenance and freshness.
  const homeAge = nowMs - timestamp(home.observed_at);
  const homeTrusted = home.source === "rendered_browser" && homeMatches(home.url) && home.render_complete === true &&
    Number.isFinite(homeAge) && homeAge >= 0 && homeAge <= MAX_AGE_MS;
  if (homeTrusted && home.primary_order_cta_direct === false)
    add("HOME_DIRECT_ORDER_CTA_MISSING", "medium",
      "The observed main order section does not offer a direct-order link; navigation may still contain one.",
      "Prepare a direct pickup CTA to the verified ordering page, keeping third-party delivery clearly separate.");
  if (homeTrusted && home.menu_link_self === true)
    add("HOME_MENU_LINK_SELF", "medium", "The main menu link points back to the homepage.",
      "Verify intended behavior and prepare a link to the actual menu/order destination.");

  // No event name (including purchase or booking_completed) is automatically a business outcome.
  const orderEvidence = record(measurement.order_outcome);
  const measurementAge = nowMs - timestamp(orderEvidence.verified_at);
  const measurementTrusted = orderEvidence.business_type === "online_order" &&
    orderEvidence.provider_reconciled === true && orderEvidence.event_semantics_verified === true &&
    orderEvidence.deduplication_verified === true &&
    Number.isFinite(measurementAge) && measurementAge >= 0 && measurementAge <= 7 * 24 * MAX_AGE_MS;
  if (!measurementTrusted) add("ORDER_OUTCOME_UNVERIFIED", "high",
    "No recent reconciled online-order outcome is supplied. Reservation events are not order evidence.",
    "Validate the order event against the order provider, including duplicates, cancellations and payment status.");

  const severityOrder = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return {
    objective: "local_direct_orders", target_url: ORDER_URL,
    mode: "shadow", writes_allowed: false, spend_authorized: false, executable: false,
    generated_at: Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : null,
    evidence: { fresh, rendered_page_verified: trusted,
      observed_at: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : null },
    journey: { status: journeyStatus, facts, payment_and_order_receipt_verified: false },
    measurement: { status: measurementTrusted ? "verified_order_outcome" : "unverified",
      reservation_events_used_as_orders: false },
    ready_for_order_optimization_review: journeyStatus === "checkout_reachable" && measurementTrusted,
    findings,
  };
}

module.exports = { assessDirectOrders };
