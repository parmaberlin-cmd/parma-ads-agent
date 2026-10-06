'use strict';

const {
  REVENUE_VERIFIED,
  REVENUE_PARTIAL,
  REVENUE_UNAVAILABLE,
  buildOrderbirdRevenueStatus,
} = require('./orderbird-revenue-status');
const { validateEconomicGroundTruth } = require('./economic-ground-truth');

const SCHEMA = 'orderbird.revenue_ground_truth.v1';
const STATES = new Set([REVENUE_VERIFIED, REVENUE_PARTIAL, REVENUE_UNAVAILABLE]);

function summarizeRecords(records) {
  const parsed = records.map((record) => {
    const result = validateEconomicGroundTruth(record);
    if (!result.ok) throw new Error('orderbird_revenue_record_invalid');
    return result.value;
  });
  if (parsed.length === 0) throw new Error('orderbird_verified_revenue_missing');
  const currencies = new Set(parsed.map((record) => record.currency));
  if (currencies.size !== 1) throw new Error('orderbird_revenue_currency_mismatch');
  const dates = parsed.map((record) => record.business_date).sort();
  return {
    record_count: parsed.length,
    period: { start: dates[0], end: dates[dates.length - 1] },
    currency: parsed[0].currency,
    gross_revenue: parsed.reduce((sum, record) => sum + record.gross_revenue, 0),
    net_revenue: parsed.reduce((sum, record) => sum + record.net_revenue, 0),
    vat: parsed.reduce((sum, record) => sum + record.vat, 0),
  };
}

function validateEvidence(evidence) {
  const errors = [];
  if (evidence?.schema !== SCHEMA) errors.push('schema_mismatch');
  if (!STATES.has(evidence?.revenue_ground_truth)) errors.push('state_invalid');
  if (evidence?.writes_allowed !== false || evidence?.spend_allowed !== false) errors.push('read_only_invariant_failed');
  if (evidence?.marketing_attribution_included !== false) errors.push('attribution_boundary_failed');
  if (evidence?.semantic_boundaries?.ga4_event_equals_revenue !== false
    || evidence?.semantic_boundaries?.wix_reservation_equals_revenue !== false
    || evidence?.semantic_boundaries?.seated_customer_equals_revenue !== false) {
    errors.push('revenue_semantic_boundary_failed');
  }
  const verified = evidence?.revenue_ground_truth === REVENUE_VERIFIED;
  if (verified && (evidence.provider_backed !== true || !evidence.revenue)) errors.push('verified_revenue_evidence_missing');
  if (!verified && (evidence.provider_backed !== false || evidence.revenue !== null)) errors.push('unverified_revenue_exposed');
  if (evidence?.commercial_decisioning_allowed !== verified) errors.push('decisioning_gate_mismatch');
  if (evidence?.automatic_spend_change_allowed !== false) errors.push('spend_authority_boundary_failed');
  if (/"(?:access_token|refresh_token|client_secret|api_key)"\s*:/i.test(JSON.stringify(evidence))) errors.push('secret_shaped_field');
  return { ok: errors.length === 0, errors };
}

async function readRevenueGroundTruth({
  healthReader = async () => ({}),
  revenueReader = async () => [],
  now = new Date(),
} = {}) {
  let health;
  try {
    health = await healthReader();
  } catch {
    health = { adapter: { usable: false, health: 'unavailable' } };
  }
  const status = buildOrderbirdRevenueStatus(health);
  let revenue = null;
  if (status.revenue_ground_truth === REVENUE_VERIFIED) {
    let records;
    try {
      records = await revenueReader();
      if (!Array.isArray(records)) throw new Error('orderbird_revenue_records_invalid');
      revenue = summarizeRecords(records);
    } catch {
      const error = new Error('orderbird_revenue_read_failed');
      error.code = 'ORDERBIRD_REVENUE_READ_FAILED';
      throw error;
    }
  }
  const verified = status.revenue_ground_truth === REVENUE_VERIFIED;
  const evidence = {
    schema: SCHEMA,
    provider: 'orderbird',
    revenue_ground_truth: status.revenue_ground_truth,
    source_health: status.source_health,
    reason: status.reason,
    observed_at: now.toISOString(),
    provider_backed: verified,
    revenue,
    marketing_attribution_included: false,
    semantic_boundaries: {
      ga4_event_equals_revenue: false,
      wix_reservation_equals_revenue: false,
      seated_customer_equals_revenue: false,
    },
    writes_allowed: false,
    spend_allowed: false,
    commercial_decisioning_allowed: verified,
    automatic_spend_change_allowed: false,
  };
  const validation = validateEvidence(evidence);
  evidence.validation = validation;
  return { validated: validation.ok, correctable: false, evidence };
}

module.exports = {
  SCHEMA,
  summarizeRecords,
  validateEvidence,
  readRevenueGroundTruth,
};
