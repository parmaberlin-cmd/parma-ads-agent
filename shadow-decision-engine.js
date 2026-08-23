const FORBIDDEN_ACTIONS = new Set(["activate", "publish", "increase_budget", "pause_live", "add_negative_keyword"]);

function n(value) { const x = Number(value); return Number.isFinite(x) ? x : 0; }
function pctDelta(current, baseline) { const b=n(baseline); return b === 0 ? null : (n(current)-b)/b; }

function conversionIntegrity({ googleConversions, ga4GoogleCpcBookings, tolerance = 0.25 }) {
  const ads=n(googleConversions), ga=n(ga4GoogleCpcBookings);
  if (ads === 0 && ga === 0) return { status:"insufficient_data", safe_for_optimization:false, discrepancy:null };
  const denominator=Math.max(ads,ga,1);
  const discrepancy=Math.abs(ads-ga)/denominator;
  return { status: discrepancy <= tolerance ? "healthy" : "mismatch", safe_for_optimization: discrepancy <= tolerance, discrepancy };
}

function buildShadowDecisions(snapshot = {}) {
  const integrity=conversionIntegrity(snapshot.conversions || {});
  const decisions=[];
  const add=(decision)=>decisions.push({ ...decision, mode:"shadow", executable:false, requires_human_approval:true });

  const google=snapshot.google || {};
  const meta=snapshot.meta || {};
  const gCost=n(google.cost), gBookings=n(google.bookings);
  const mCost=n(meta.cost), mBookings=n(meta.bookings);

  if (!integrity.safe_for_optimization) add({ channel:"google", action:"investigate_tracking", priority:"critical", reason:`conversion_integrity_${integrity.status}` });
  if (gCost > 0 && gBookings === 0) add({ channel:"google", action:"review_search_terms", priority:"high", reason:"spend_without_bookings" });
  if (mCost > 0 && mBookings === 0) add({ channel:"meta", action:"review_creative_and_destination", priority:"high", reason:"spend_without_bookings" });

  const googleTrend=pctDelta(google.bookings, google.baselineBookings);
  if (googleTrend !== null && googleTrend <= -0.3) add({ channel:"google", action:"diagnose_booking_drop", priority:"high", reason:"bookings_down_30pct_or_more" });

  const metaTrend=pctDelta(meta.bookings, meta.baselineBookings);
  if (metaTrend !== null && metaTrend <= -0.3) add({ channel:"meta", action:"diagnose_booking_drop", priority:"high", reason:"bookings_down_30pct_or_more" });

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
