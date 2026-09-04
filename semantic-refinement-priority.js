function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function prioritizeSemanticRefinement(cells = []) {
  return (cells || [])
    .filter((cell) => cell && cell.manual_semantic_review_candidate === true)
    .map((cell) => {
      const cost = num(cell.cost_eur);
      const clicks = num(cell.clicks);
      const rows = num(cell.search_term_rows);
      const protectedLocal = cell.protected_local_intent === true;
      const competitor = cell.competitor_strategy_review === true;
      const reason = cell.review_reason || 'unclassified_semantics';
      const priorityScore = protectedLocal ? 0 : Math.round((Math.log1p(cost) * 45 + Math.log1p(clicks) * 30 + Math.log1p(rows) * 10) * 10) / 10;
      return {
        intent: cell.intent || null,
        matched_keyword: cell.matched_keyword || null,
        match_type: cell.match_type || null,
        search_term_rows: rows,
        clicks,
        cost_eur: cost,
        review_reason: reason,
        competitor_strategy_review: competitor,
        protected_local_intent: protectedLocal,
        priority_score: priorityScore,
        next_step: competitor ? 'competitor_strategy_review' : 'refine_semantic_taxonomy',
        automatic_negative_supported: false,
        execution_authorized: false,
      };
    })
    .sort((a,b) => b.priority_score - a.priority_score || b.cost_eur - a.cost_eur);
}

module.exports = { prioritizeSemanticRefinement };