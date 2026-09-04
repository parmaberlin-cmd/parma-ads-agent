function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const LOCAL = new Set(["brand", "near_me", "local_kreuzberg", "open_now"]);
const COMMERCIAL = new Set(["brand", "near_me", "local_kreuzberg", "open_now", "delivery_or_takeaway", "quality_seeking", "italian_style"]);

function localIntentScore({ intent, distance_evidence = null } = {}) {
  let score = LOCAL.has(intent) ? 70 : intent === "berlin_generic" ? 35 : 20;
  const distance = finite(distance_evidence);
  if (distance !== null) score = Math.min(100, score + Math.max(0, 30 - distance * 6));
  return { score: Math.round(score), status: "decision_support_prior", observed_outcome: false };
}

function customerIntentScore({ intent } = {}) {
  const score = intent === "brand" ? 85 : COMMERCIAL.has(intent) ? 70 : intent === "pizza_generic" || intent === "berlin_generic" ? 45 : 25;
  return { score, status: "decision_support_prior", observed_outcome: false };
}

function queryValueScore({ intent, local_score, customer_score, economics_verified = false } = {}) {
  const local = finite(local_score) ?? localIntentScore({ intent }).score;
  const customer = finite(customer_score) ?? customerIntentScore({ intent }).score;
  const score = Math.round(local * 0.45 + customer * 0.55);
  return {
    score,
    status: economics_verified ? "economic_prior_only" : "intent_prior_only",
    business_value_verified: false,
    optimization_permission: false,
    guardrail: "A query-value score is not a measured customer, revenue event, conversion or permission to mutate advertising."
  };
}

module.exports = { localIntentScore, customerIntentScore, queryValueScore };
