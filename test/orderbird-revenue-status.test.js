'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REVENUE_VERIFIED,
  REVENUE_PARTIAL,
  REVENUE_UNAVAILABLE,
  buildOrderbirdRevenueStatus,
} = require('../orderbird-revenue-status');

test('orderbird revenue is unavailable without verified provider transport', () => {
  const status = buildOrderbirdRevenueStatus({
    adapter:{ usable:false, health:'unavailable' },
    store:{ healthy:true, writable:true },
    last_run:{ status:'never_run', received:0, rejected:0 },
  });
  assert.equal(status.revenue_ground_truth, REVENUE_UNAVAILABLE);
  assert.equal(status.source_health, 'unavailable');
  assert.equal(status.mutation_permission, false);
  assert.equal(status.attribution_kind, 'none');
});

test('orderbird revenue is partial when durable store is unhealthy', () => {
  const status = buildOrderbirdRevenueStatus({
    adapter:{ usable:true, health:'healthy' },
    store:{ healthy:false, writable:false },
    last_run:{ status:'success', received:1, rejected:0 },
  });
  assert.equal(status.revenue_ground_truth, REVENUE_PARTIAL);
  assert.equal(status.reason, 'durable_store_unhealthy');
});

test('orderbird revenue is partial when rows were rejected', () => {
  const status = buildOrderbirdRevenueStatus({
    adapter:{ usable:true, health:'healthy' },
    store:{ healthy:true, writable:true },
    last_run:{ status:'success', received:3, rejected:1 },
  });
  assert.equal(status.revenue_ground_truth, REVENUE_PARTIAL);
  assert.equal(status.reason, 'ingestion_rejected_rows');
});

test('orderbird revenue is unavailable when transport works but no revenue has been ingested', () => {
  const status = buildOrderbirdRevenueStatus({
    adapter:{ usable:true, health:'healthy' },
    store:{ healthy:true, writable:true },
    last_run:{ status:'never_run', received:0, rejected:0 },
  });
  assert.equal(status.revenue_ground_truth, REVENUE_UNAVAILABLE);
  assert.equal(status.source_health, 'healthy');
});

test('orderbird revenue is verified only after successful non-empty clean ingestion', () => {
  const status = buildOrderbirdRevenueStatus({
    adapter:{ usable:true, health:'healthy' },
    store:{ healthy:true, writable:true },
    last_run:{ status:'success', received:4, upserted:4, rejected:0 },
  });
  assert.equal(status.revenue_ground_truth, REVENUE_VERIFIED);
  assert.equal(status.source_health, 'healthy');
  assert.equal(status.reason, 'provider_read_and_persistence_verified');
  assert.equal(status.contains_pii, false);
});
