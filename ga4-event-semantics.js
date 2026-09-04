function validateDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw new TypeError(`${name} must be YYYY-MM-DD`);
}

function validateEventNames(eventNames) {
  const names = Array.isArray(eventNames) ? eventNames.map((v) => String(v || "").trim()).filter(Boolean) : [];
  if (!names.length || names.length > 20) throw new TypeError("eventNames must contain 1-20 names");
  if (names.some((name) => name.length > 100)) throw new TypeError("eventName is too long");
  return names;
}

async function runEventDateSemantics({ accessToken, propertyId, start, end, eventNames, httpClient }) {
  if (!accessToken) throw new TypeError("accessToken is required");
  if (!/^\d+$/.test(String(propertyId || ""))) throw new TypeError("propertyId is invalid");
  validateDate(start, "start"); validateDate(end, "end");
  const names = validateEventNames(eventNames);
  const client = httpClient || require("axios");
  const response = await client.post(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      dateRanges: [{ startDate: start, endDate: end }],
      dimensions: [{ name: "date" }, { name: "eventName" }, { name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }, { name: "sessions" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: names } } },
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: "10000",
    },
    { headers: { authorization: `Bearer ${accessToken}` }, timeout: 20000 }
  );
  return response.data.rows || [];
}

function summarizeEventDateSemantics(rows = [], eventNames = []) {
  const names = validateEventNames(eventNames);
  const summary = Object.fromEntries(names.map((name) => [name, {
    event_count: 0,
    total_users: 0,
    sessions: 0,
    google_cpc_event_count: 0,
    active_dates: 0,
    max_daily_event_count: 0,
  }]));
  const dateCounts = Object.fromEntries(names.map((name) => [name, new Map()]));

  for (const row of rows || []) {
    const date = String(row.dimensionValues?.[0]?.value || "");
    const event = String(row.dimensionValues?.[1]?.value || "");
    if (!summary[event]) continue;
    const source = String(row.dimensionValues?.[2]?.value || "").toLowerCase();
    const medium = String(row.dimensionValues?.[3]?.value || "").toLowerCase();
    const eventCount = Math.max(0, Number(row.metricValues?.[0]?.value || 0));
    const users = Math.max(0, Number(row.metricValues?.[1]?.value || 0));
    const sessions = Math.max(0, Number(row.metricValues?.[2]?.value || 0));
    summary[event].event_count += Number.isFinite(eventCount) ? eventCount : 0;
    summary[event].total_users += Number.isFinite(users) ? users : 0;
    summary[event].sessions += Number.isFinite(sessions) ? sessions : 0;
    if (source === "google" && medium === "cpc") summary[event].google_cpc_event_count += Number.isFinite(eventCount) ? eventCount : 0;
    if (date) dateCounts[event].set(date, (dateCounts[event].get(date) || 0) + (Number.isFinite(eventCount) ? eventCount : 0));
  }

  for (const name of names) {
    const counts = [...dateCounts[name].values()];
    summary[name].active_dates = counts.filter((value) => value > 0).length;
    summary[name].max_daily_event_count = counts.length ? Math.max(...counts) : 0;
    summary[name].events_per_user = summary[name].total_users > 0 ? summary[name].event_count / summary[name].total_users : null;
    summary[name].events_per_session = summary[name].sessions > 0 ? summary[name].event_count / summary[name].sessions : null;
    summary[name].attribution_scope = "session_source_medium";
    summary[name].semantic_identity = "unverified";
  }
  return summary;
}

module.exports = { runEventDateSemantics, summarizeEventDateSemantics };
