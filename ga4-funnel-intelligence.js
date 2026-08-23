const axios = require("axios");

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

function reconcileConversions({ googleAdsConversions, ga4GoogleCpcBookings }) {
  if (googleAdsConversions == null || ga4GoogleCpcBookings == null) return { comparable: false, confidence: "blocked", reason: "missing_source" };
  const ads = Number(googleAdsConversions || 0);
  const ga4 = Number(ga4GoogleCpcBookings || 0);
  const denominator = Math.max(ads, ga4, 1);
  const relativeGap = Math.abs(ads - ga4) / denominator;
  const confidence = relativeGap <= 0.2 ? "high" : relativeGap <= 0.4 ? "medium" : "low";
  return { comparable: true, google_ads: ads, ga4_google_cpc: ga4, relative_gap: relativeGap, confidence, automation_safe: confidence === "high" };
}

module.exports = { runFunnelReport, summarizeFunnel, reconcileConversions };
