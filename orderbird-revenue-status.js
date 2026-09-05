'use strict';

const REVENUE_VERIFIED = 'REVENUE_VERIFIED';
const REVENUE_PARTIAL = 'REVENUE_PARTIAL';
const REVENUE_UNAVAILABLE = 'REVENUE_UNAVAILABLE';

function buildOrderbirdRevenueStatus(ingestionHealth = {}) {
  const adapter = ingestionHealth.adapter || {};
  const store = ingestionHealth.store || {};
  const lastRun = ingestionHealth.last_run || {};

  const base = {
    provider: 'orderbird',
    source_kind: 'pos_revenue_ground_truth',
    attribution_kind: 'none',
    source_health: 'unavailable',
    revenue_ground_truth: REVENUE_UNAVAILABLE,
    reason: 'provider_supported_transport_unavailable',
    contains_pii: false,
    mutation_permission: false,
  };

  if (!adapter.usable || adapter.health === 'unavailable') return base;

  if (!store.healthy || store.writable === false) {
    return {
      ...base,
      source_health: 'degraded',
      revenue_ground_truth: REVENUE_PARTIAL,
      reason: 'durable_store_unhealthy',
    };
  }

  if (lastRun.status === 'error') {
    return {
      ...base,
      source_health: 'degraded',
      revenue_ground_truth: REVENUE_PARTIAL,
      reason: 'last_ingestion_failed',
    };
  }

  if (lastRun.status !== 'success' || Number(lastRun.received || 0) === 0) {
    return {
      ...base,
      source_health: 'healthy',
      revenue_ground_truth: REVENUE_UNAVAILABLE,
      reason: 'no_verified_revenue_ingested',
    };
  }

  if (Number(lastRun.rejected || 0) > 0) {
    return {
      ...base,
      source_health: 'degraded',
      revenue_ground_truth: REVENUE_PARTIAL,
      reason: 'ingestion_rejected_rows',
    };
  }

  return {
    ...base,
    source_health: 'healthy',
    revenue_ground_truth: REVENUE_VERIFIED,
    reason: 'provider_read_and_persistence_verified',
  };
}

module.exports = {
  REVENUE_VERIFIED,
  REVENUE_PARTIAL,
  REVENUE_UNAVAILABLE,
  buildOrderbirdRevenueStatus,
};
