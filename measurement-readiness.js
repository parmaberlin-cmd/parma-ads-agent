const { buildTemporalReconciliation } = require('./temporal-reconciliation');
const { validateOutcomeEvidence } = require('./measurement-contract');
const { assessCustomerFunnel } = require('./customer-funnel-integrity');

function buildMeasurementReadiness(input = {}) {
  const temporal = buildTemporalReconciliation(input.temporal || {});
  const outcome = validateOutcomeEvidence(input.outcome || {});
  const funnelType = input.funnel_type || (input.outcome?.outcome === 'direct_order_completed' ? 'direct_order' : 'reservation');
  const funnel = assessCustomerFunnel(funnelType, input.funnel || {});
  const sourceHealth = input.source_health === true;
  const semanticReady = outcome.valid === true;
  const temporalReady = temporal.direct_count_comparison_supported === true;
  const funnelReady = funnel.status === 'verified_funnel';
  const ready = sourceHealth && semanticReady && temporalReady && funnelReady;
  const blockers = [];
  if (!sourceHealth) blockers.push('source_health_unverified');
  blockers.push(...temporal.blockers.map((x) => `temporal:${x}`));
  blockers.push(...(outcome.blockers || []).map((x) => `outcome:${x}`));
  if (!funnelReady) blockers.push('funnel:incomplete_or_unverified');
  return {
    source_health_verified:sourceHealth,
    semantic_ready:semanticReady,
    temporal_ready:temporalReady,
    funnel_ready:funnelReady,
    measurement_ready:ready,
    blockers:[...new Set(blockers)],
    optimization_analysis_allowed:ready,
    execution_authorized:false,
    tracking_write_authorized:false,
    campaign_write_authorized:false,
    spend_authorized:false,
  };
}

module.exports = { buildMeasurementReadiness };
