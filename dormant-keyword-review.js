function norm(value) { return String(value || '').trim().toLowerCase(); }
function num(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }

function classifyDormantKeyword(keyword) {
  const t = norm(keyword);
  if (/\b(potsdam|wilmersdorf|alexanderplatz)\b/.test(t)) return 'off_area_or_nonlocal_review';
  if (/\b(zero stress|zerostress|l osteria|domino|milano vice|toukis|toros|gambino|nonno|mosaiko|pipasa|trattoria toscana)\b/.test(t)) return 'competitor_or_other_business_strategy_review';
  if (/^[^\s]+\s+berlin$/.test(t) && !/pizza|pizzeria|parma/.test(t)) return 'named_entity_review';
  return 'unknown_dormant';
}

function reviewDormantKeywords(rows = []) {
  const dormant = (rows || []).filter((row) => num(row.impressions) === 0 && num(row.clicks) === 0 && num(row.cost_eur) === 0);
  const items = dormant.map((row) => ({
    keyword: row.keyword || null,
    match_type: row.match_type || null,
    ad_group: row.ad_group || null,
    classification: classifyDormantKeyword(row.keyword),
    observed_spend_impact_eur: 0,
    priority: 'low_while_dormant',
    pause_supported: false,
    removal_supported: false,
    execution_authorized: false,
  }));
  const counts = items.reduce((acc,item)=>{acc[item.classification]=(acc[item.classification]||0)+1; return acc;},{});
  return { dormant_rows:items.length, classification_counts:counts, items, writes_allowed:false };
}

module.exports = { classifyDormantKeyword, reviewDormantKeywords };