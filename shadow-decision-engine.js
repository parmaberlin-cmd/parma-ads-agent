const FORBIDDEN_ACTIONS = new Set(["activate", "publish", "increase_budget", "pause_live", "add_negative_keyword"]);
const { assessConversionConfidence } = require('./conversion-confidence');
const { observedNumber } = require('./observed-number');

function n(value) { const x = Number(value); return Number.isFinite(x) ? x : 0; }
function pctDelta(current, baseline) { const c=observedNumber(current), b=observedNumber(baseline); return c === null || b === null || b === 0 ? null : (c-b)/b; }

function conversionIntegrity({ googleConversions, ga4GoogleCpcBookings, tolerance = 0.25, evidence = {} } = {}) {
  const ads=observedNumber(googleConversions), ga=observedNumber(ga4GoogleCpcBookings);
  if (ads === null || ga === null || (ads === 0 && ga === 0)) return { status:"insufficient_data", safe_for_optimization:false, discrepancy:null };
  const denominator=Math.max(ads,ga,1);
  const discrepancy=Math.abs(ads-ga)/denominator;
  if (!assessConversionConfidence(evidence).optimization_allowed) return { status:'unverified', safe_for_optimization:false, discrepancy, discrepancy_is_descriptive_only:true };
  if (Math.max(ads,ga) < 3) return { status:'insufficient_data', safe_for_optimization:false, discrepancy };
  return { status: discrepancy <= tolerance ? "healthy" : "mismatch", safe_for_optimization: discrepancy <= tolerance, discrepancy };
}

function buildShadowDecisions(snapshot = {}) {
  const integrity=conversionIntegrity(snapshot.conversions || {});
  const decisions=[];
  const add=(decision)=>decisions.push({ ...decision, mode:"shadow", executable:false, requires_human_approval:true });

  const google=snapshot.google || {};
  const meta=snapshot.meta || {};
  const gCost=n(google.cost);
  const mCost=n(meta.cost);

  if (!integrity.safe_for_optimization) add({ channel:"google", action:"investigate_tracking", priority:"critical", reason:`conversion_integrity_${integrity.status}` });
  const gVerified = google.booking_semantics_verified === true;
  const mVerified = meta.booking_semantics_verified === true;
  if (gCost > 0 && gVerified && observedNumber(google.bookings) === 0) add({ channel:"google", action:"review_search_terms", priority:"high", reason:"spend_without_bookings" });
  if (mCost > 0 && mVerified && observedNumber(meta.bookings) === 0) add({ channel:"meta", action:"review_creative_and_destination", priority:"high", reason:"spend_without_bookings" });

  const googleTrend=pctDelta(google.bookings, google.baselineBookings);
  if (gVerified && google.baseline_comparable === true && googleTrend !== null && googleTrend <= -0.3) add({ channel:"google", action:"diagnose_booking_drop", priority:"high", reason:"bookings_down_30pct_or_more" });

  const metaTrend=pctDelta(meta.bookings, meta.baselineBookings);
  if (mVerified && meta.baseline_comparable === true && metaTrend !== null && metaTrend <= -0.3) add({ channel:"meta", action:"diagnose_booking_drop", priority:"high", reason:"bookings_down_30pct_or_more" });

  return { mode:"shadow", generated_at:new Date().toISOString(), integrity, decisions, writes_performed:0, spend_changed:false };
}

function assertShadowSafe(result) {
  if (!result || result.mode !== "shadow" || result.writes_performed !== 0 || result.spend_changed !== false) throw new Error("shadow result violates no-write contract");
  for (const decision of result.decisions || []) {
    if (decision.executable !== false || decision.requires_human_approval !== true) throw new Error("shadow decision is executable");
    if (FORBIDDEN_ACTIONS.has(decision.action)) throw new Error(`forbidden shadow action: ${decision.action}`);
  }
  return true;
}

module.exports={ conversionIntegrity, buildShadowDecisions, assertShadowSafe };
