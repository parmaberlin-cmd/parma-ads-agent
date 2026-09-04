function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function classifyIntent(term) {
  const t = normalize(term);
  if (!t) return "unknown";
  if (/\b(parma|parmaberlin|parma berlin)\b/.test(t)) return "brand";
  if (/\b(near me|in meiner nähe|nähe|nearby|close to me)\b/.test(t)) return "near_me";
  if (/\b(kreuzberg|wrangel|schlesisches tor|schlesi)\b/.test(t)) return "local_kreuzberg";
  if (/\b(reservation|reserve|reservieren|reservierung|tisch reservieren|book a table|table booking)\b/.test(t)) return "reservation_intent";
  if (/\b(direkt bestellen|online bestellen|order online|direct order|pickup|abholung)\b/.test(t)) return "direct_order_intent";
  if (/\b(open|geöffnet|öffnungszeiten|hours|late|jetzt|now)\b/.test(t)) return "open_now";
  if (/\b(bio|organic|ökologisch|oekologisch)\b/.test(t)) return "organic_bio";
  if (/\b(sourdough|sauerteig|lievito madre)\b/.test(t)) return "sourdough";
  if (/\b(zola|zerostress|zero stress|standard serious|castel montecroce)\b/.test(t)) return "competitor_brand";
  if (/\b(recipe|rezept|selber machen|teig rezept|dough recipe|kalorien|calories|kcal)\b/.test(t)) return "informational";
  if (/\b(delivery|liefer|bestellen|order|takeaway|abholen)\b/.test(t)) return "delivery_or_takeaway";
  if (/\b(best|beste|top|good|gute|empfehlung|recommend)\b/.test(t)) return "quality_seeking";
  if (/\b(italian|italienisch|italiana|italiano|napoli|napoletana)\b/.test(t)) return "italian_style";
  if (/\b(berlin)\b/.test(t)) return "berlin_generic";
  if (/\b(pizza|pizzeria)\b/.test(t)) return "pizza_generic";
  return "other";
}

function commercialRole(intent) {
  if (["brand","near_me","local_kreuzberg","open_now"].includes(intent)) return "likely_visit_or_walk_in";
  if (intent === "reservation_intent") return "likely_reservation";
  if (intent === "direct_order_intent") return "likely_direct_order";
  if (intent === "delivery_or_takeaway") return "likely_marketplace_or_delivery";
  if (["organic_bio","sourdough","quality_seeking","italian_style","berlin_generic","pizza_generic","competitor_brand"].includes(intent)) return "discovery";
  return "unknown";
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function intentSafety(intent) {
  const local = ["near_me","local_kreuzberg","open_now","brand"].includes(intent);
  const informational = intent === "informational";
  const competitor = intent === "competitor_brand";
  return {
    negative_keyword_supported: false,
    semantic_negative_candidate: informational,
    competitor_strategy_review: competitor,
    walk_in_measurement_risk: local,
    local_intent: local,
    rationale: local
      ? "Local-intent searches may produce unmeasured walk-ins; zero registered bookings are not evidence of waste."
      : informational
        ? "Informational semantics may justify a negative-keyword proposal after corpus review; execution remains prohibited."
        : competitor
          ? "Competitor-brand queries require a separate strategy review rather than automatic exclusion."
          : "Conversion integrity is unverified; search-term exclusions require independent evidence before any write.",
  };
}

function analyzeSearchTerms(rows = []) {
  const clusters = new Map();
  for (const row of rows || []) {
    const intent = classifyIntent(row.search_term);
    const current = clusters.get(intent) || { intent, commercial_role:commercialRole(intent), terms:0, impressions:0, clicks:0, cost_eur:0, registered_conversions:0 };
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
    ...intentSafety(c.intent),
    requires_write: false,
  })).sort((a,b) => b.clicks - a.clicks);
}

module.exports = { classifyIntent, commercialRole, intentSafety, analyzeSearchTerms };
