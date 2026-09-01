function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function classifyIntent(term) {
  const t = normalize(term);
  if (!t) return "unknown";
  if (/\b(parma|parmaberlin|parma berlin)\b/.test(t)) return "brand";
  if (/\b(near me|in meiner nähe|nähe|nearby|close to me)\b/.test(t)) return "near_me";
  if (/\b(kreuzberg|wrangel|schlesisches tor|schlesi)\b/.test(t)) return "local_kreuzberg";
  if (/\b(delivery|liefer|bestellen|order|takeaway|abholen|pickup)\b/.test(t)) return "delivery_or_takeaway";
  if (/\b(open|geöffnet|öffnungszeiten|hours|late|jetzt|now)\b/.test(t)) return "open_now";
  if (/\b(best|beste|top|good|gute|empfehlung|recommend)\b/.test(t)) return "quality_seeking";
  if (/\b(italian|italienisch|italiana|italiano|napoli|napoletana)\b/.test(t)) return "italian_style";
  if (/\b(berlin)\b/.test(t)) return "berlin_generic";
  if (/\b(pizza|pizzeria)\b/.test(t)) return "pizza_generic";
  return "other";
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function analyzeSearchTerms(rows = []) {
  const clusters = new Map();
  for (const row of rows || []) {
    const intent = classifyIntent(row.search_term);
    const current = clusters.get(intent) || { intent, terms:0, impressions:0, clicks:0, cost_eur:0, registered_conversions:0 };
    current.terms += 1;
    current.impressions += number(row.impressions);
    current.clicks += number(row.clicks);
    current.cost_eur += number(row.cost_eur);
    current.registered_conversions += number(row.conversions);
    clusters.set(intent, current);
  }
  return [...clusters.values()].map((c) => ({
    ...c,
    ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
    avg_cpc_eur: c.clicks > 0 ? c.cost_eur / c.clicks : 0,
    conversion_status: "unverified_measurement",
  })).sort((a,b) => b.clicks - a.clicks);
}

module.exports = { classifyIntent, analyzeSearchTerms };
