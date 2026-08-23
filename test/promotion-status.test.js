const test = require('node:test');
const assert = require('node:assert/strict');
const { allSourcesFresh, buildSanitizedPromotionStatus } = require('../promotion-status');

function healthyShadow() {
  const collectedAt = new Date().toISOString();
  return {
    generated_at: collectedAt,
    data_quality: {
      channel_ready: { google: true, meta: true },
      sources: {
        google: { state: 'fresh' },
        ga4: { state: 'fresh' },
        meta: { state: 'fresh' },
      },
    },
    live_sources: {
      google: { access_ok: true, configuration_complete: true },
      ga4: { access_ok: true, configuration_complete: true },
      meta: { access_ok: true, configuration_complete: true },
    },
    conversion_integrity: {
      status: 'healthy',
      optimization_allowed: true,
    },
  };
}

test('source freshness requires all three live sources', () => {
  assert.equal(allSourcesFresh(healthyShadow().data_quality), true);
  const degraded = healthyShadow();
  degraded.data_quality.sources.ga4.state = 'stale';
  assert.equal(allSourcesFresh(degraded.data_quality), false);
});

test('runtime status fails closed when build validation and history are missing', () => {
  const status = buildSanitizedPromotionStatus({
    shadowResult: healthyShadow(),
    metaPreflightState: { result: { ready: true } },
    buildValidated: false,
    shadowRecords: [],
  });

  assert.equal(status.promotion_ready, false);
  assert.equal(status.autonomy_class, 'observe_and_propose');
  assert.ok(status.blockers.includes('readiness:regression_suite_not_verified'));
  assert.ok(status.blockers.includes('history:insufficient_shadow_runs'));
  assert.equal(status.execution_authorized, false);
  assert.equal(status.writes_allowed, false);
});

test('missing Meta preflight remains an independent live blocker', () => {
  const status = buildSanitizedPromotionStatus({
    shadowResult: healthyShadow(),
    metaPreflightState: { result: { ready: false } },
    buildValidated: true,
    shadowRecords: Array.from({ length: 20 }, (_, index) => ({
      id: `r-${index}`,
      before: 1,
      after: 2,
      outcome: 'observed',
      expected_direction: 'up',
      data_quality: 'high',
      attribution_confidence: 'high',
      safety_violation: false,
    })),
  });

  assert.equal(status.gates.readiness, true);
  assert.equal(status.gates.live_validation, false);
  assert.ok(status.blockers.includes('live:meta_preflight_ready'));
  assert.equal(status.promotion_ready, false);
});

test('even fully green evidence cannot authorize external execution', () => {
  const status = buildSanitizedPromotionStatus({
    shadowResult: healthyShadow(),
    metaPreflightState: { result: { ready: true } },
    buildValidated: true,
    shadowRecords: Array.from({ length: 20 }, (_, index) => ({
      id: `r-${index}`,
      before: 1,
      after: 2,
      outcome: 'observed',
      expected_direction: 'up',
      data_quality: 'high',
      attribution_confidence: 'high',
      safety_violation: false,
    })),
  });

  assert.equal(status.promotion_ready, true);
  assert.equal(status.autonomy_class, 'supervised_reversible_candidate');
  assert.equal(status.external_write_authorized, false);
  assert.equal(status.spend_authorized, false);
  assert.equal(status.activation_authorized, false);
  assert.equal(status.execution_authorized, false);
  assert.equal(status.writes_allowed, false);
});
