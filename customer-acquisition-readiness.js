const { buildDirectOrderOpportunity } = require('./direct-order-opportunity');
const { buildWalkInMeasurementState } = require('./local-action-intelligence');
const { assessCustomerFunnel } = require('./customer-funnel-integrity');

function buildCustomerAcquisitionReadiness(input = {}) {
  const directOrder = buildDirectOrderOpportunity(input.direct_order || {});
  const walkIn = buildWalkInMeasurementState(input.walk_in || {});
  const reservation = assessCustomerFunnel('reservation', input.reservation || {});
  const orderFunnel = assessCustomerFunnel('direct_order', input.direct_order_funnel || {});
  const measurementVerified = input.measurement_verified === true;
  const economicsComplete = input.economics_complete === true;
  const channels = {
    reservation: { outcome_ready: reservation.status === 'verified_funnel', value_ready: economicsComplete },
    direct_order: { outcome_ready: directOrder.outcome_verified && orderFunnel.status === 'verified_funnel', value_ready: directOrder.commercial_comparison_ready && economicsComplete },
    walk_in: { outcome_ready: walkIn.walk_in_measurement_complete, value_ready: economicsComplete && walkIn.walk_in_measurement_complete },
  };
  const readyForCommercialRanking = measurementVerified && Object.values(channels).some((channel) => channel.outcome_ready && channel.value_ready);
  return {
    channels,
    measurement_verified: measurementVerified,
    economics_complete: economicsComplete,
    ready_for_commercial_ranking: readyForCommercialRanking,
    safe_default_priority: readyForCommercialRanking ? 'rank_verified_incremental_customer_value' : 'repair_measurement_and_collect_missing_value_inputs',
    campaign_mutation_allowed:false,
    site_mutation_allowed:false,
    spend_authorized:false,
    writes_allowed:false,
  };
}

module.exports = { buildCustomerAcquisitionReadiness };
