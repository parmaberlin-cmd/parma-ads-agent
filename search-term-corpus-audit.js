const { classifyIntent, commercialRole, intentSafety } = require('./google-search-term-analysis');

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function auditSearchTermCorpus(rows = []) {
  const buckets = new Map();
  let clicks = 0;
  let impressions = 0;
  let cost = 0;
  let rowsWithClicks = 0;
  let rowsWithCost = 0;
  const matchedKeywords = new Set();
  const matchTypes = new Set();

  for (const row of rows || []) {
    const intent = classifyIntent(row.search_term);
    const keyword = norm(row.matched_keyword) || '(unknown)';
    const matchType = String(row.match_type || 'UNKNOWN');
    const key = `${intent}\u0000${keyword}\u0000${matchType}`;
    const current = buckets.get(key) || {
      intent,
      commercial_role: commercialRole(intent),
      matched_keyword: keyword,
      match_type: matchType,
      search_term_rows: 0,
      impressions: 0,
      clicks: 0,
      cost_eur: 0,
    };
    const rowClicks = num(row.clicks);
    const rowImpressions = num(row.impressions);
    const rowCost = num(row.cost_eur);
    current.search_term_rows += 1;
    current.impressions += rowImpressions;
    current.clicks += rowClicks;
    current.cost_eur += rowCost;
    buckets.set(key, current);
    clicks += rowClicks;
    impressions += rowImpressions;
    cost += rowCost;
    if (rowClicks > 0) rowsWithClicks += 1;
    if (rowCost > 0) rowsWithCost += 1;
    matchedKeywords.add(keyword);
    matchTypes.add(matchType);
  }

  const cells = [...buckets.values()].map((cell) => {
    const safety = intentSafety(cell.intent);
    const reviewCandidate = Boolean(safety.semantic_negative_candidate || safety.competitor_strategy_review || cell.intent === 'other');
    return {
      ...cell,
      ctr: cell.impressions > 0 ? cell.clicks / cell.impressions : 0,
      avg_cpc_eur: cell.clicks > 0 ? cell.cost_eur / cell.clicks : 0,
      click_share: clicks > 0 ? cell.clicks / clicks : 0,
      cost_share: cost > 0 ? cell.cost_eur / cost : 0,
      protected_local_intent: safety.local_intent,
      semantic_negative_candidate: safety.semantic_negative_candidate,
      competitor_strategy_review: safety.competitor_strategy_review,
      manual_semantic_review_candidate: reviewCandidate,
      review_reason: safety.semantic_negative_candidate ? 'informational_semantics' : safety.competitor_strategy_review ? 'competitor_strategy' : cell.intent === 'other' ? 'unclassified_semantics' : null,
      automatic_negative_supported: false,
      raw_search_terms_exposed: false,
      conversion_evidence_used: false,
      execution_authorized: false,
    };
  }).sort((a,b) => b.clicks - a.clicks || b.cost_eur - a.cost_eur);

  return {
    coverage: {
      search_term_rows_received: (rows || []).length,
      search_term_rows_accounted_for: cells.reduce((sum, cell) => sum + cell.search_term_rows, 0),
      rows_with_clicks: rowsWithClicks,
      rows_with_cost: rowsWithCost,
      matched_keyword_count: matchedKeywords.size,
      match_types: [...matchTypes].sort(),
      complete_for_received_corpus: cells.reduce((sum, cell) => sum + cell.search_term_rows, 0) === (rows || []).length,
    },
    totals: { impressions, clicks, cost_eur: cost },
    cells,
    privacy: {
      raw_search_terms_logged: false,
      aggregation_dimensions: ['intent','matched_keyword','match_type'],
    },
    negative_keyword_execution_allowed: false,
    writes_allowed: false,
  };
}

module.exports = { auditSearchTermCorpus };