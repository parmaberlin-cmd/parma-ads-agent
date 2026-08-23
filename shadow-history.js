const MAX_RECORDS = 200;

function createShadowHistoryStore({ maxRecords = MAX_RECORDS } = {}) {
  const records = [];
  const limit = Math.max(1, Number(maxRecords) || MAX_RECORDS);

  function append(record = {}) {
    const generatedAt = record.generated_at || new Date().toISOString();
    const normalized = {
      id: String(record.id || `shadow-${generatedAt}`),
      generated_at: generatedAt,
      outcome: record.outcome ?? null,
      expected_direction: record.expected_direction ?? null,
      before: record.before ?? null,
      after: record.after ?? null,
      data_quality: record.data_quality || "unknown",
      attribution_confidence: record.attribution_confidence || "unknown",
      safety_violation: record.safety_violation === true,
      source_health: {
        google: record.source_health?.google === true,
        ga4: record.source_health?.ga4 === true,
        meta: record.source_health?.meta === true,
      },
    };
    records.push(normalized);
    if (records.length > limit) records.splice(0, records.length - limit);
    return normalized;
  }

  function list() {
    return records.map((record) => ({ ...record, source_health: { ...record.source_health } }));
  }

  return { append, list };
}

function recordFromShadowResult(result = {}) {
  const confidence = result.data_quality?.confidence;
  return {
    generated_at: result.generated_at,
    data_quality: confidence === "high" ? "high" : confidence || "unknown",
    attribution_confidence: result.conversion_integrity?.confidence || "unknown",
    safety_violation: false,
    source_health: {
      google: result.live_sources?.google?.access_ok === true,
      ga4: result.live_sources?.ga4?.access_ok === true,
      meta: result.live_sources?.meta?.access_ok === true,
    },
    outcome: null,
    expected_direction: null,
    before: null,
    after: null,
  };
}

module.exports = { createShadowHistoryStore, recordFromShadowResult };
