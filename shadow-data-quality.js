function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function isoAgeHours(value, now = new Date()) { if (!value) return null; const ts = new Date(value); if (Number.isNaN(ts.getTime())) return null; return Math.max(0, (now.getTime() - ts.getTime()) / 3600000); }
function sourceState({ available, ageHours, maxAgeHours }) { if (!available) return 'unavailable'; if (ageHours == null) return 'freshness_unknown'; return ageHours <= maxAgeHours ? 'fresh' : 'stale'; }

function evaluateShadowDataQuality(snapshot = {}, { now = new Date(), maxAgeHours = 36 } = {}) {
  const live = snapshot.live_sources || {};
  const access = snapshot.access || {};
  const googleAge = isoAgeHours(live.google?.last_seen_at || live.google?.collected_at || snapshot.generated_at, now);
  const ga4Age = isoAgeHours(live.ga4?.last_seen_at || live.ga4?.collected_at || snapshot.generated_at, now);
  const metaAge = isoAgeHours(live.meta?.last_seen_at || live.meta?.collected_at || snapshot.generated_at, now);
  const sources = {
    google: { available: access.google_ok === true, age_hours: googleAge, state: sourceState({ available: access.google_ok === true, ageHours: googleAge, maxAgeHours }) },
    ga4: { available: access.ga4_ok === true, age_hours: ga4Age, state: sourceState({ available: access.ga4_ok === true, ageHours: ga4Age, maxAgeHours }) },
    meta: { available: access.meta_ok === true, age_hours: metaAge, state: sourceState({ available: access.meta_ok === true, ageHours: metaAge, maxAgeHours }) },
  };
  const blockers = [];
  for (const [name, source] of Object.entries(sources)) if (source.state !== 'fresh') blockers.push(`${name}_${source.state}`);
  const googleClicks = finite(live.google?.totals?.clicks);
  const googleCost = finite(live.google?.totals?.cost ?? live.google?.totals?.spend);
  const bookings = finite(snapshot.conversions?.booking_completed);
  if (googleClicks != null && googleClicks < 0) blockers.push('google_negative_clicks');
  if (googleCost != null && googleCost < 0) blockers.push('google_negative_cost');
  if (bookings != null && bookings < 0) blockers.push('negative_bookings');
  if (bookings != null && googleClicks != null && bookings > googleClicks && googleClicks > 0) blockers.push('bookings_exceed_google_clicks');
  const freshCount = Object.values(sources).filter((s) => s.state === 'fresh').length;
  const completeness = freshCount / 3;
  const integrityOk = !blockers.some((b) => b.includes('negative_') || b === 'bookings_exceed_google_clicks');
  const confidence = blockers.length === 0 ? 'high' : completeness >= 2 / 3 && integrityOk ? 'low' : 'blocked';
  return {
    ready_for_recommendations: blockers.length === 0,
    ready_for_execution: false,
    confidence,
    completeness_ratio: Number(completeness.toFixed(2)),
    max_age_hours: maxAgeHours,
    sources,
    integrity_ok: integrityOk,
    blockers: [...new Set(blockers)],
    writes_allowed: false,
  };
}

function assertQualityFailClosed(quality) {
  if (quality?.ready_for_execution !== false || quality?.writes_allowed !== false) throw new Error('shadow data quality gate violated fail-closed contract');
  if (quality?.blockers?.length && quality.ready_for_recommendations !== false) throw new Error('blocked shadow data was marked recommendation-ready');
  return true;
}

module.exports = { evaluateShadowDataQuality, assertQualityFailClosed, isoAgeHours, sourceState };