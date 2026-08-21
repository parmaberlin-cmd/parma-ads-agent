function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function analyzeSearchTerms(rows = [], {
  minClicksForNegative = 4,
  minCostForNegative = 4,
  minConversionsForExpansion = 2,
} = {}) {
  const recommendations = [];

  for (const row of rows) {
    const term = normalizeText(row.search_term || row.term);
    if (!term) continue;

    const clicks = num(row.clicks);
    const cost = num(row.cost_eur ?? row.cost);
    const conversions = num(row.conversions ?? row.bookings);
    const keyword = normalizeText(row.keyword);
    const matchType = normalizeText(row.match_type);

    if (conversions === 0 && clicks >= minClicksForNegative && cost >= minCostForNegative) {
      recommendations.push({
        type: "negative_keyword_candidate",
        term,
        reason: "Search term generated meaningful traffic/cost without conversion.",
        evidence: { clicks, cost_eur: cost, conversions },
        requires_authorization: true,
      });
    }

    if (conversions >= minConversionsForExpansion && term !== keyword) {
      recommendations.push({
        type: "keyword_expansion_candidate",
        term,
        reason: "Search term converted repeatedly and is not identical to the supplied keyword.",
        evidence: { clicks, cost_eur: cost, conversions, source_keyword: keyword || null },
        requires_authorization: true,
      });
    }

    if (matchType === "broad" && clicks >= minClicksForNegative && conversions === 0) {
      recommendations.push({
        type: "broad_match_attention",
        term,
        reason: "Broad-match traffic has enough clicks to deserve relevance review.",
        evidence: { clicks, conversions },
        requires_authorization: false,
      });
    }
  }

  return recommendations;
}

function rankCreatives(rows = [], {
  minImpressions = 500,
  maxFrequencyBeforeFatigue = 3.5,
} = {}) {
  return rows.map((row) => {
    const impressions = num(row.impressions);
    const clicks = num(row.clicks);
    const bookings = num(row.bookings ?? row.conversions);
    const spend = num(row.spend_eur ?? row.spend);
    const frequency = num(row.frequency);
    const ctr = impressions ? (clicks / impressions) * 100 : 0;
    const cpc = clicks ? spend / clicks : null;
    const cpa = bookings ? spend / bookings : null;

    let evidence_status = "insufficient_data";
    if (impressions >= minImpressions) evidence_status = "sufficient_reach";
    if (bookings > 0) evidence_status = "conversion_evidence";

    const flags = [];
    if (frequency >= maxFrequencyBeforeFatigue && ctr < 1) flags.push("possible_fatigue");
    if (impressions >= minImpressions && clicks === 0) flags.push("no_click_response");
    if (clicks >= 10 && bookings === 0) flags.push("traffic_without_bookings");

    return {
      creative_id: String(row.creative_id || row.id || ""),
      name: row.name || null,
      evidence_status,
      metrics: {
        spend_eur: spend,
        impressions,
        clicks,
        bookings,
        ctr_percent: Number(ctr.toFixed(4)),
        cpc_eur: cpc === null ? null : Number(cpc.toFixed(4)),
        cpa_eur: cpa === null ? null : Number(cpa.toFixed(4)),
        frequency,
      },
      flags,
    };
  }).sort((a, b) => {
    if (a.metrics.bookings !== b.metrics.bookings) return b.metrics.bookings - a.metrics.bookings;
    if (a.metrics.ctr_percent !== b.metrics.ctr_percent) return b.metrics.ctr_percent - a.metrics.ctr_percent;
    return a.creative_id.localeCompare(b.creative_id);
  });
}

function proposeCreativeTests(ranked = []) {
  const proposals = [];
  for (const creative of ranked) {
    if (creative.evidence_status === "insufficient_data") continue;
    if (creative.flags.includes("possible_fatigue")) {
      proposals.push({
        creative_id: creative.creative_id,
        hypothesis: "Refresh hook/visual while preserving the proven offer and reservation intent.",
        reason: "Frequency is high while CTR is weak.",
        requires_authorization: true,
      });
    }
    if (creative.flags.includes("traffic_without_bookings")) {
      proposals.push({
        creative_id: creative.creative_id,
        hypothesis: "Test clearer reservation CTA or stronger landing-page continuity.",
        reason: "Creative generates traffic but not bookings.",
        requires_authorization: true,
      });
    }
  }
  return proposals;
}

module.exports = {
  analyzeSearchTerms,
  proposeCreativeTests,
  rankCreatives,
};
