'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEvidence,
  readRevenueGroundTruth,
} = require('../orderbird-revenue-ground-truth-specialist');

test('reports revenue unavailable without fabricating provider data', async () => {
  const result = await readRevenueGroundTruth({ now: new Date('2026-10-06T08:30:00Z') });
  assert.equal(result.validated, true);
  assert.equal(result.evidence.revenue_ground_truth, 'REVENUE_UNAVAILABLE');
  assert.equal(result.evidence.reason, 'provider_supported_transport_unavailable');
  assert.equal(result.evidence.provider_backed, false);
  assert.equal(result.evidence.revenue, null);
  assert.equal(result.evidence.commercial_decisioning_allowed, false);
  assert.equal(result.evidence.automatic_spend_change_allowed, false);
});

test('preserves revenue semantic boundaries in unavailable and partial states', async () => {
  const result = await readRevenueGroundTruth({
    healthReader: async () => ({
      adapter: { usable: true, health: 'healthy' },
      store: { healthy: false, writable: false },
      last_run: { status: 'success', received: 1, rejected: 0 },
    }),
  });
  assert.equal(result.evidence.revenue_ground_truth, 'REVENUE_PARTIAL');
  assert.equal(result.evidence.revenue, null);
  assert.equal(result.evidence.semantic_boundaries.ga4_event_equals_revenue, false);
  assert.equal(result.evidence.semantic_boundaries.wix_reservation_equals_revenue, false);
  assert.equal(result.evidence.marketing_attribution_included, false);
});

test('accepts verified revenue only from valid provider-authority records', async () => {
  const result = await readRevenueGroundTruth({
    healthReader: async () => ({
      adapter: { usable: true, health: 'healthy' },
      store: { healthy: true, writable: true },
      last_run: { status: 'success', received: 2, rejected: 0 },
    }),
    revenueReader: async () => [
      { schema:'economic_ground_truth.v1',provider:'orderbird',restaurant_id:'parma',business_date:'2026-10-04',currency:'EUR',gross_revenue:100,net_revenue:84,vat:16,captured_at:'2026-10-04T22:00:00.000Z',source_authority:'provider_supported_read_only' },
      { schema:'economic_ground_truth.v1',provider:'orderbird',restaurant_id:'parma',business_date:'2026-10-05',currency:'EUR',gross_revenue:120,net_revenue:100,vat:20,captured_at:'2026-10-05T22:00:00.000Z',source_authority:'provider_supported_read_only' },
    ],
  });
  assert.equal(result.validated, true);
  assert.equal(result.evidence.revenue_ground_truth, 'REVENUE_VERIFIED');
  assert.deepEqual(result.evidence.revenue, { record_count:2,period:{start:'2026-10-04',end:'2026-10-05'},currency:'EUR',gross_revenue:220,net_revenue:184,vat:36 });
  assert.equal(result.evidence.provider_backed, true);
  assert.equal(result.evidence.commercial_decisioning_allowed, true);
  assert.equal(result.evidence.automatic_spend_change_allowed, false);
});

test('validation rejects revenue values in an unverified state', () => {
  const evidence = {
    schema:'orderbird.revenue_ground_truth.v1',
    revenue_ground_truth:'REVENUE_UNAVAILABLE',
    provider_backed:false,
    revenue:{ gross_revenue:100 },
    marketing_attribution_included:false,
    semantic_boundaries:{ ga4_event_equals_revenue:false,wix_reservation_equals_revenue:false,seated_customer_equals_revenue:false },
    writes_allowed:false,
    spend_allowed:false,
    commercial_decisioning_allowed:false,
    automatic_spend_change_allowed:false,
  };
  assert.equal(validateEvidence(evidence).ok, false);
});

test('verified health without valid records fails closed with a sanitized error', async () => {
  await assert.rejects(
    () => readRevenueGroundTruth({
      healthReader: async () => ({
        adapter: { usable: true, health: 'healthy' },
        store: { healthy: true, writable: true },
        last_run: { status: 'success', received: 1, rejected: 0 },
      }),
      revenueReader: async () => [{ secret: 'provider detail' }],
    }),
    (error) => error.code === 'ORDERBIRD_REVENUE_READ_FAILED' && error.message === 'orderbird_revenue_read_failed',
  );
});
