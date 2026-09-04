function finite(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function normalizeKeyword(row = {}) {
  return {
    keyword: String(row.keyword || row.text || '').trim(),
    ad_group: String(row.ad_group || '').trim() || null,
    match_type: String(row.match_type || '').trim() || null,
    status: String(row.status || '').trim() || null,
    impressions: finite(row.impressions), clicks: finite(row.clicks), cost: finite(row.cost),
    registered_conversions: finite(row.conversions),
    conversion_status: 'unverified_diagnostic_only'
  };
}

function normalizeSearchTerm(row = {}) {
  return {
    query: String(row.query || row.search_term || '').trim(),
    ad_group: String(row.ad_group || '').trim() || null,
    keyword: String(row.keyword || '').trim() || null,
    impressions: finite(row.impressions), clicks: finite(row.clicks), cost: finite(row.cost),
    registered_conversions: finite(row.conversions),
    conversion_status: 'unverified_diagnostic_only'
  };
}

function ingest({ keywords = [], search_terms = [], expected_keywords = 29, expected_search_terms = 2055 } = {}) {
  const k = keywords.map(normalizeKeyword).filter(x => x.keyword);
  const s = search_terms.map(normalizeSearchTerm).filter(x => x.query);
  return {
    keywords:k, search_terms:s,
    coverage:{
      keywords:{reviewable:k.length, expected:expected_keywords, complete:k.length === expected_keywords},
      search_terms:{reviewable:s.length, expected:expected_search_terms, complete:s.length === expected_search_terms}
    },
    pii_expected:false,
    writes_allowed:false,
    optimization_permission:false,
    guardrail:'Incomplete corpus coverage must be reported and cannot be represented as a complete audit.'
  };
}

module.exports = { normalizeKeyword, normalizeSearchTerm, ingest };
