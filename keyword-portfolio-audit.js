const { classifyIntent } = require('./google-search-term-analysis');

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function auditKeywordPortfolio(rows = []) {
  const clean = (rows || []).map((row, index) => ({
    row_index: index + 1,
    keyword: row.keyword || null,
    normalized_keyword: norm(row.keyword),
    ad_group: row.ad_group || null,
    ad_group_id: row.ad_group_id || null,
    match_type: row.match_type || null,
    status: row.status || null,
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    cost_eur: num(row.cost_eur),
    intent: classifyIntent(row.keyword),
  }));

  const totalClicks = clean.reduce((sum, row) => sum + row.clicks, 0);
  const totalCost = clean.reduce((sum, row) => sum + row.cost_eur, 0);
  const byKeyword = new Map();
  for (const row of clean) {
    const key = row.normalized_keyword;
    if (!key) continue;
    const bucket = byKeyword.get(key) || [];
    bucket.push(row);
    byKeyword.set(key, bucket);
  }

  const overlapKeys = new Set(
    [...byKeyword.entries()]
      .filter(([, bucket]) => new Set(bucket.map((row) => row.ad_group_id || row.ad_group)).size > 1)
      .map(([key]) => key)
  );

  const audited = clean.map((row) => {
    const protectedIntent = ['brand', 'near_me', 'local_kreuzberg', 'open_now'].includes(row.intent);
    return {
      ...row,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
      avg_cpc_eur: row.clicks > 0 ? row.cost_eur / row.clicks : 0,
      click_share: totalClicks > 0 ? row.clicks / totalClicks : 0,
      cost_share: totalCost > 0 ? row.cost_eur / totalCost : 0,
      cross_ad_group_overlap: overlapKeys.has(row.normalized_keyword),
      protected_local_intent: protectedIntent,
      registered_conversion_evidence_used: false,
      automatic_negative_supported: false,
      automatic_pause_supported: false,
      consolidation_review_supported: overlapKeys.has(row.normalized_keyword),
      execution_authorized: false,
    };
  });

  return {
    coverage: {
      rows_received: clean.length,
      rows_audited: audited.length,
      unique_normalized_keywords: new Set(clean.map((row) => row.normalized_keyword).filter(Boolean)).size,
      cross_ad_group_overlap_keywords: overlapKeys.size,
      complete_for_received_corpus: clean.length === audited.length,
    },
    totals: { impressions: clean.reduce((s,r)=>s+r.impressions,0), clicks: totalClicks, cost_eur: totalCost },
    keywords: audited.sort((a,b) => b.clicks - a.clicks || b.impressions - a.impressions),
    conversion_integrity_required_for_outcome_optimization: true,
    writes_allowed: false,
    spend_allowed: false,
  };
}

module.exports = { auditKeywordPortfolio };