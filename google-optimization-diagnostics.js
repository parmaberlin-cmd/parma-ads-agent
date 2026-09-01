function n(value) { const x = Number(value || 0); return Number.isFinite(x) ? x : 0; }
function normalizeKeyword(text) { return String(text || "").trim().toLowerCase().replace(/\s+/g, " "); }

function analyzeKeywordOverlap(rows = []) {
  const groups = new Map();
  for (const row of rows || []) {
    const keyword = normalizeKeyword(row.keyword || row.keyword_text || row.text);
    if (!keyword) continue;
    const item = groups.get(keyword) || { keyword, rows: [], ad_groups: new Set(), impressions: 0, clicks: 0, cost_eur: 0 };
    item.rows.push(row);
    if (row.ad_group || row.ad_group_name) item.ad_groups.add(String(row.ad_group || row.ad_group_name));
    item.impressions += n(row.impressions);
    item.clicks += n(row.clicks);
    item.cost_eur += n(row.cost_eur ?? row.cost);
    groups.set(keyword, item);
  }
  return [...groups.values()].filter((item) => item.ad_groups.size > 1).map((item) => ({
    keyword: item.keyword,
    ad_groups: [...item.ad_groups].sort(),
    occurrences: item.rows.length,
    impressions: item.impressions,
    clicks: item.clicks,
    cost_eur: Number(item.cost_eur.toFixed(4)),
    registered_conversions_status: "unverified_measurement",
    diagnosis: "cross_ad_group_overlap",
    requires_write: false,
  })).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

function analyzeRankBudget({ searchImpressionShare, lostIsRank, lostIsBudget, topImpressionRate, absoluteTopImpressionRate }) {
  const rank = n(lostIsRank), budget = n(lostIsBudget);
  const primaryConstraint = rank > budget ? "rank" : budget > rank ? "budget" : "mixed";
  return {
    search_impression_share: n(searchImpressionShare),
    lost_is_rank: rank,
    lost_is_budget: budget,
    top_impression_rate: n(topImpressionRate),
    absolute_top_impression_rate: n(absoluteTopImpressionRate),
    primary_constraint: primaryConstraint,
    budget_increase_supported: false,
    rationale: primaryConstraint === "rank"
      ? "Rank loss exceeds budget loss; improve relevance/quality and diagnose auction position before considering more spend."
      : "Budget loss is not sufficient evidence for a spend increase while conversion integrity is unverified.",
    requires_write: false,
  };
}

function analyzeDeviceDistribution(rows = []) {
  const totalClicks = rows.reduce((sum, row) => sum + n(row.clicks), 0);
  const totalCost = rows.reduce((sum, row) => sum + n(row.cost_eur ?? row.cost), 0);
  return (rows || []).map((row) => ({
    device: row.device || row.device_name || "unknown",
    impressions: n(row.impressions),
    clicks: n(row.clicks),
    cost_eur: n(row.cost_eur ?? row.cost),
    click_share: totalClicks > 0 ? n(row.clicks) / totalClicks : null,
    cost_share: totalCost > 0 ? n(row.cost_eur ?? row.cost) / totalCost : null,
    registered_conversions_status: "unverified_measurement",
    requires_write: false,
  })).sort((a, b) => b.clicks - a.clicks);
}

function analyzeHourDistribution(rows = []) {
  return (rows || []).map((row) => ({
    day: row.day || row.day_of_week || null,
    hour: row.hour == null ? null : n(row.hour),
    impressions: n(row.impressions),
    clicks: n(row.clicks),
    cost_eur: n(row.cost_eur ?? row.cost),
    registered_conversions_status: "unverified_measurement",
    schedule_change_supported: false,
    requires_write: false,
  })).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

module.exports = { analyzeKeywordOverlap, analyzeRankBudget, analyzeDeviceDistribution, analyzeHourDistribution };
