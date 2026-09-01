const fs = require('node:fs');
const { analyzeSearchTerms } = require('../google-search-term-analysis');
const { analyzeRsaSet } = require('../google-rsa-analysis');
const { analyzeKeywordOverlap, analyzeRankBudget, analyzeDeviceDistribution, analyzeHourDistribution, analyzeGeoDistribution } = require('../google-optimization-diagnostics');
const { buildConversionReconciliation } = require('../conversion-reconciliation');
const { auditKeywordPortfolio } = require('../keyword-portfolio-audit');
const { auditSearchTermCorpus } = require('../search-term-corpus-audit');
const { prioritizeSemanticRefinement } = require('../semantic-refinement-priority');
const { reviewDormantKeywords } = require('../dormant-keyword-review');

function readJson(path) {
  const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!parsed || parsed.success !== true) throw new Error('live intelligence payload is not successful');
  return parsed;
}

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? n * 100 : n;
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('usage: node scripts/analyze-google-live-readonly.js <intelligence.json>');
  const data = readJson(inputPath);
  const overview = data.overview?.[0] || {};
  const conversionAction = data.conversion_actions?.[0] || {};
  const searchClusters = analyzeSearchTerms(data.search_terms || []);
  const searchCorpusAudit = auditSearchTermCorpus(data.search_terms || []);
  const semanticRefinement = prioritizeSemanticRefinement(searchCorpusAudit.cells);
  const keywordPortfolioAudit = auditKeywordPortfolio(data.keywords || []);
  const dormantKeywordReview = reviewDormantKeywords(data.keywords || []);
  const keywordOverlap = analyzeKeywordOverlap(data.keywords || []);
  const rsa = analyzeRsaSet(data.rsa_ads || [], { conversionTrusted: false });
  const rankBudget = analyzeRankBudget({
    searchImpressionShare: pct(overview.search_impression_share),
    lostIsRank: pct(overview.search_rank_lost_impression_share),
    lostIsBudget: pct(overview.search_budget_lost_impression_share),
    topImpressionRate: pct(overview.search_top_impression_share),
    absoluteTopImpressionRate: pct(overview.search_absolute_top_impression_share),
  });
  const devices = analyzeDeviceDistribution(data.devices || []);
  const hours = analyzeHourDistribution(data.hours || []);
  const geo = analyzeGeoDistribution(data.geography || []);
  const conversion = buildConversionReconciliation({
    ads_primary_conversions: overview.conversions,
    ads_all_conversions: conversionAction.all_conversions,
    timezone_aligned: false,
    date_basis_aligned: false,
    attribution_compatible: false,
    counting_understood: false,
    semantic_identity_verified: false,
  });

  const safe = {
    mode: 'read_only_local_analysis_of_sanitized_live_payload',
    reader_version_observed: data.reader_version ?? null,
    date_range: data.date_range || null,
    campaign: {
      impressions: Number(overview.impressions || 0),
      clicks: Number(overview.clicks || 0),
      cost_eur: Number(overview.cost_eur || 0),
      registered_conversions: Number(overview.conversions || 0),
      registered_conversions_status: 'unverified_measurement',
    },
    corpus_coverage: {
      keyword_rows_received: keywordPortfolioAudit.coverage.rows_received,
      keyword_rows_audited: keywordPortfolioAudit.coverage.rows_audited,
      search_term_rows_received: searchCorpusAudit.coverage.search_term_rows_received,
      search_term_rows_accounted_for: searchCorpusAudit.coverage.search_term_rows_accounted_for,
      raw_search_terms_logged: false,
    },
    keyword_portfolio_audit: keywordPortfolioAudit,
    dormant_keyword_review: dormantKeywordReview,
    search_term_corpus_audit: searchCorpusAudit,
    semantic_refinement_priorities: semanticRefinement,
    rank_budget: rankBudget,
    search_intent_clusters: searchClusters,
    keyword_overlap: keywordOverlap,
    devices,
    top_delivery_windows: hours.slice(0, 12),
    geography: geo,
    rsa_diagnostics: rsa.map((row) => ({
      ad_group: row.ad_group,
      asset_counts: row.asset_counts,
      ad_strength: row.ad_strength,
      conversion_evidence: row.conversion_evidence,
      issues: row.issues,
      requires_write: false,
    })),
    conversion_reconciliation: conversion,
    writes_allowed: false,
    execution_allowed: false,
    spend_allowed: false,
  };
  process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
}

if (require.main === module) main();
module.exports = { main };
