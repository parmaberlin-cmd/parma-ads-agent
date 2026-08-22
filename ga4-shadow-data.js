const axios = require("axios");
const { getDateRange } = require("./live-shadow-data");

function ga4Configured(env = process.env) {
  return Boolean(env.GA4_PROPERTY_ID && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);
}

function sanitizeGoogleError(error, fallback) {
  return error?.response?.data?.error_description || error?.response?.data?.error?.message || error?.response?.data?.error || error?.message || fallback;
}

async function getGoogleAccessToken(env = process.env) {
  const body = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token" });
  const response = await axios.post("https://oauth2.googleapis.com/token", body, { headers: { "content-type": "application/x-www-form-urlencoded" }, timeout: 20000 });
  return response.data.access_token;
}

function parseGa4Date(value) {
  const text = String(value || "");
  if (!/^\d{8}$/.test(text)) return null;
  return `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}T12:00:00.000Z`;
}

function sourceMediumFilters(googleCpcOnly) {
  if (!googleCpcOnly) return [];
  return [
    { filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: "google", caseSensitive: false } } },
    { filter: { fieldName: "sessionMedium", stringFilter: { matchType: "EXACT", value: "cpc", caseSensitive: false } } },
  ];
}

async function runBookingReport({ accessToken, propertyId, start, end, googleCpcOnly = false }) {
  const filters = [
    { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "booking_completed" } } },
    ...sourceMediumFilters(googleCpcOnly),
  ];
  const body = {
    dateRanges: [{ startDate: start, endDate: end }], dimensions: [{ name: "date" }], metrics: [{ name: "eventCount" }],
    dimensionFilter: { andGroup: { expressions: filters } }, orderBys: [{ dimension: { dimensionName: "date", orderType: "ALPHANUMERIC" }, desc: true }], limit: "1000",
  };
  const response = await axios.post(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, body, { headers: { authorization: `Bearer ${accessToken}` }, timeout: 20000 });
  const rows = response.data.rows || [];
  const total = rows.reduce((sum, row) => sum + Number(row.metricValues?.[0]?.value || 0), 0);
  const latest = rows.find((row) => Number(row.metricValues?.[0]?.value || 0) > 0);
  return { event_count: total, last_seen_at: latest ? parseGa4Date(latest.dimensionValues?.[0]?.value) : null };
}

async function runReservationFunnelReport({ accessToken, propertyId, start, end, googleCpcOnly = false }) {
  const body = {
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }, { name: "sessions" }, { name: "activeUsers" }],
    dimensionFilter: { andGroup: { expressions: [
      { filter: { fieldName: "eventName", inListFilter: { values: ["page_view", "booking_started", "booking_completed"] } } },
      ...sourceMediumFilters(googleCpcOnly),
    ] } },
    limit: "100",
  };
  const response = await axios.post(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, body, { headers: { authorization: `Bearer ${accessToken}` }, timeout: 20000 });
  const events = {};
  for (const row of response.data.rows || []) {
    const name = row.dimensionValues?.[0]?.value;
    if (!name) continue;
    events[name] = {
      event_count: Number(row.metricValues?.[0]?.value || 0),
      sessions: Number(row.metricValues?.[1]?.value || 0),
      active_users: Number(row.metricValues?.[2]?.value || 0),
    };
  }
  return events;
}

async function collectGa4ShadowData({ env = process.env, days = 30, now = new Date() } = {}) {
  if (!ga4Configured(env)) return { access_ok: false, configuration_complete: false, error: "ga4_configuration_incomplete", required_variable: "GA4_PROPERTY_ID", total_booking_completed: null, google_cpc_booking_completed: null, last_seen_at: null };
  const { start, end } = getDateRange(days, now);
  try {
    const accessToken = await getGoogleAccessToken(env);
    const [allBookings, googleCpcBookings, allFunnelResult, googleCpcFunnelResult] = await Promise.allSettled([
      runBookingReport({ accessToken, propertyId: env.GA4_PROPERTY_ID, start, end, googleCpcOnly: false }),
      runBookingReport({ accessToken, propertyId: env.GA4_PROPERTY_ID, start, end, googleCpcOnly: true }),
      runReservationFunnelReport({ accessToken, propertyId: env.GA4_PROPERTY_ID, start, end, googleCpcOnly: false }),
      runReservationFunnelReport({ accessToken, propertyId: env.GA4_PROPERTY_ID, start, end, googleCpcOnly: true }),
    ]);
    if (allBookings.status === "rejected") throw allBookings.reason;
    if (googleCpcBookings.status === "rejected") throw googleCpcBookings.reason;
    const funnel_diagnostics = {};
    if (allFunnelResult.status === "rejected") funnel_diagnostics.all_traffic = sanitizeGoogleError(allFunnelResult.reason, "ga4_funnel_read_failed");
    if (googleCpcFunnelResult.status === "rejected") funnel_diagnostics.google_cpc = sanitizeGoogleError(googleCpcFunnelResult.reason, "ga4_funnel_read_failed");
    return {
      access_ok: true, configuration_complete: true, period: { start, end }, event_name: "booking_completed",
      total_booking_completed: allBookings.value.event_count, google_cpc_booking_completed: googleCpcBookings.value.event_count,
      last_seen_at: googleCpcBookings.value.last_seen_at || allBookings.value.last_seen_at,
      reservation_funnel: {
        all_traffic: allFunnelResult.status === "fulfilled" ? allFunnelResult.value : null,
        google_cpc: googleCpcFunnelResult.status === "fulfilled" ? googleCpcFunnelResult.value : null,
      },
      funnel_access: { all_traffic_ok: allFunnelResult.status === "fulfilled", google_cpc_ok: googleCpcFunnelResult.status === "fulfilled" },
      ...(Object.keys(funnel_diagnostics).length ? { funnel_diagnostics } : {}),
    };
  } catch (error) {
    return { access_ok: false, configuration_complete: true, error: sanitizeGoogleError(error, "ga4_read_failed"), total_booking_completed: null, google_cpc_booking_completed: null, last_seen_at: null };
  }
}

module.exports = { ga4Configured, collectGa4ShadowData, parseGa4Date, sourceMediumFilters, runReservationFunnelReport };
