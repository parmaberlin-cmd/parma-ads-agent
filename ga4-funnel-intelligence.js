const axios = require("axios");
const { summarizeOrderInventory } = require('./order-signal-diagnostics');

async function runFunnelReport({ accessToken, propertyId, start, end, eventNames }) {
  const response = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: [{ name: "eventName" }, { name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: eventNames } } },
      limit: "10000",
    },
    { headers: { authorization: `Bearer ${accessToken}` }, timeout: 20000 }
  );
  return response.data.rows || [];
}

async function runEventInventory({ accessToken, propertyId, start, end }) {
  const response = await axios.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: "200",
    },
    { headers: { authorization: `Bearer ${accessToken}` }, timeout: 20000 }
  );
  return response.data.rows || [];
}

function summarizeEventInventory(rows = [], expectedEvents = []) {
  const expected = new Set(expectedEvents.map((value) => String(value).toLowerCase()));
  const events = rows.map((row) => ({
    event_name: String(row.dimensionValues?.[0]?.value || "").trim(),
    event_count: Math.max(0, Number(row.metricValues?.[0]?.value || 0)),
  })).filter((row) => row.event_name && Number.isFinite(row.event_count));

  const reservationCandidates = events.filter((row) => {
    const name = row.event_name.toLowerCase();
    return !expected.has(name) && /(reserv|book|table|appoint|calendar|schedule)/i.test(name);
  }).slice(0, 20);

  return {
    event_count: events.length,
    top_events: events.slice(0, 50),
    reservation_candidates: reservationCandidates,
    order_candidates: summarizeOrderInventory(rows),
  };
}

function summarizeFunnel(rows = [], eventNames = []) {
  const totals = Object.fromEntries(eventNames.map((name) => [name, 0]));
  const googleCpc = Object.fromEntries(eventNames.map((name) => [name, 0]));
  for (const row of rows) {
    const event = row.dimensionValues?.[0]?.value;
    const source = row.dimensionValues?.[1]?.value;
    const medium = row.dimensionValues?.[2]?.value;
    const count = Number(row.metricValues?.[0]?.value || 0);
    if (!(event in totals)) continue;
    totals[event] += count;
    if (String(source).toLowerCase() === "google" && String(medium).toLowerCase() === "cpc") googleCpc[event] += count;
  }
  return { totals, google_cpc: googleCpc };
}

function funnelTrackingStatus(funnel = {}, expectedEvents = []) {
  const configured = new Set(Array.isArray(funnel.event_names) ? funnel.event_names : expectedEvents);
  const totals = funnel.totals && typeof funnel.totals === "object" ? funnel.totals : {};
  const status = {};
  for (const eventName of expectedEvents) {
    const count = Number(totals[eventName] || 0);
    status[eventName] = {
      configured: configured.has(eventName),
      observed: Number.isFinite(count) && count > 0,
      count: Number.isFinite(count) ? Math.max(0, count) : 0,
    };
  }
  return status;
}

function funnelCompleteness(funnel = {}, expectedEvents = []) {
  const tracking = funnelTrackingStatus(funnel, expectedEvents);
  const configuredCount = expectedEvents.filter((name) => tracking[name]?.configured).length;
  const observedCount = expectedEvents.filter((name) => tracking[name]?.observed).length;
  return {
    expected_events: expectedEvents.length,
    configured_events: configuredCount,
    observed_events: observedCount,
    configuration_complete: expectedEvents.length > 0 && configuredCount === expectedEvents.length,
    observation_complete: expectedEvents.length > 0 && observedCount === expectedEvents.length,
    tracking,
  };
}

function safeRate(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  return bottom > 0 ? top / bottom : null;
}

function funnelRates(funnel = {}) {
  const totals = funnel.totals || {};
  const pageViews = Number(totals.reservation_page_view || 0);
  const starts = Number(totals.reservation_start || 0);
  const bookings = Number(totals.booking_completed || 0);
  return {
    page_to_start: safeRate(starts, pageViews),
    start_to_booking: safeRate(bookings, starts),
    page_to_booking: safeRate(bookings, pageViews),
  };
}

function reconcileConversions({ googleAdsConversions, ga4GoogleCpcBookings }) {
  if (googleAdsConversions == null || ga4GoogleCpcBookings == null) return { comparable: false, confidence: "blocked", reason: "missing_source" };
  const ads = Number(googleAdsConversions || 0);
  const ga4 = Number(ga4GoogleCpcBookings || 0);
  const denominator = Math.max(ads, ga4, 1);
  const relativeGap = Math.abs(ads - ga4) / denominator;
  const confidence = relativeGap <= 0.2 ? "high" : relativeGap <= 0.4 ? "medium" : "low";
  return { comparable: true, google_ads: ads, ga4_google_cpc: ga4, relative_gap: relativeGap, confidence, automation_safe: confidence === "high" };
}

module.exports = {
  runFunnelReport,
  runEventInventory,
  summarizeEventInventory,
  summarizeFunnel,
  funnelTrackingStatus,
  funnelCompleteness,
  funnelRates,
  reconcileConversions,
};
