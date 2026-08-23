function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoAgeHours(value, now = new Date()) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  const ageHours = (now - timestamp) / 3_600_000;
  return ageHours < 0 ? null : ageHours;
}

function sourceState({ available, ageHours, maxAgeHours }) {
  if (!available) return "unavailable";
  if (ageHours == null) return "freshness_unknown";
  return ageHours <= maxAgeHours ? "fresh" : "stale";
}

function evaluateShadowDataQuality(snapshot = {}, { now = new Date(), maxAgeHours = 36 } = {}) {
  const live = snapshot.live_sources || {};
  const access = snapshot.access || {};
  const fallbackCollectedAt = snapshot.collected_at || snapshot.now || snapshot.generated_at;

  const sourceSpec = {
    google: [access.google_ok === true, live.google],
    ga4: [access.ga4_ok === true, live.ga4],
    meta: [access.meta_ok === true, live.meta],
  };

  const sources = {};
  for (const [name, [available, data]] of Object.entries(sourceSpec)) {
    const collectedAt = data?.collected_at || fallbackCollectedAt;
    const ageHours = isoAgeHours(collectedAt, now);
    sources[name] = {
      available,
      collected_at: collectedAt || null,
      age_hours: ageHours,
      state: sourceState({ available, ageHours, maxAgeHours }),
      business_last_seen_at: data?.last_seen_at || null,
    };
  }

  const integrityBlockers = [];
  const clicks = finite(live.google?.totals?.clicks);
  const cost = finite(live.google?.totals?.spend_eur ?? live.google?.totals?.cost);
  const bookings = finite(snapshot.conversions?.booking_completed);

  if (clicks != null && clicks < 0) integrityBlockers.push("google_negative_clicks");
  if (cost != null && cost < 0) integrityBlockers.push("google_negative_cost");
  if (bookings != null && bookings < 0) integrityBlockers.push("negative_bookings");

  const integrityOk = integrityBlockers.length === 0;
  const channelReady = {
    google: sources.google.state === "fresh" && sources.ga4.state === "fresh" && integrityOk,
    meta: sources.meta.state === "fresh",
  };

  const blockers = [...integrityBlockers];
  for (const [name, source] of Object.entries(sources)) {
    if (source.state !== "fresh") blockers.push(`${name}_${source.state}`);
  }

  const completeness = Object.values(sources).filter((source) => source.state === "fresh").length / 3;
  const readyForRecommendations = channelReady.google || channelReady.meta;
  const confidence = !readyForRecommendations ? "blocked" : blockers.length ? "partial" : "high";

  return {
    ready_for_recommendations: readyForRecommendations,
    ready_for_execution: false,
    confidence,
    completeness_ratio: Number(completeness.toFixed(2)),
    max_age_hours: maxAgeHours,
    sources,
    channel_ready: channelReady,
    integrity_ok: integrityOk,
    blockers: [...new Set(blockers)],
    writes_allowed: false,
  };
}

function assertQualityFailClosed(quality) {
  if (quality?.ready_for_execution !== false || quality?.writes_allowed !== false) {
    throw new Error("shadow quality gate violated fail-closed contract");
  }
  if (!quality?.ready_for_recommendations && quality?.confidence !== "blocked") {
    throw new Error("blocked data has invalid confidence");
  }
  return true;
}

module.exports = {
  evaluateShadowDataQuality,
  assertQualityFailClosed,
  isoAgeHours,
  sourceState,
};
