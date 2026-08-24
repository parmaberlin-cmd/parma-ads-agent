const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReadinessActionPlan } = require('../readiness-action-plan');
const { buildOperationalDashboard } = require('../operational-dashboard');

test('readiness plan separates automatic and human blockers', () => {
  const summary = {
    source_health: { google:false, ga4:true, meta:true },
    conversion_integrity: { status:'unverified', optimization_allowed:false },
    tracking: { reservation_start:{ configured:true, observed:false } },
    history: { total_runs:3, storage:{ durable:false, healthy:true } },
  };
  const promotion = { promotion_ready:false, blockers:['history:storage_not_durable'] };
  const plan = buildReadinessActionPlan({ summary, promotion });
  assert.equal(plan.complete, false);
  assert.ok(plan.actions.some((item) => item.code === 'VERIFY_GOOGLE_LIVE_ACCESS' && item.automatic));
  assert.ok(plan.actions.some((item) => item.code === 'ATTACH_DURABLE_SHADOW_STORAGE' && item.requires_human));
  assert.ok(plan.actions.some((item) => item.code === 'ACCUMULATE_SHADOW_RUNS' && item.remaining === 11));
  assert.equal(plan.writes_allowed, false);
  assert.equal(plan.spend_allowed, false);
});

test('readiness plan clears when supervised gates are satisfied', () => {
  const summary = {
    source_health: { google:true, ga4:true, meta:true },
    conversion_integrity: { status:'healthy', optimization_allowed:true },
    tracking: { reservation_start:{ configured:true, observed:true } },
    history: { total_runs:14, storage:{ durable:true, healthy:true } },
  };
  const promotion = { promotion_ready:true, blockers:[] };
  const plan = buildReadinessActionPlan({ summary, promotion });
  assert.equal(plan.complete, true);
  assert.equal(plan.total_remaining, 0);
});

test('dashboard exposes compact remaining work without enabling execution', () => {
  const summary = {
    source_health: { google:false, ga4:true, meta:true },
    data_quality: { blockers:[] },
    conversion_integrity: { status:'unverified', optimization_allowed:false },
    tracking: {},
    history: { total_runs:0, storage:{ durable:false, healthy:true } },
  };
  const dashboard = buildOperationalDashboard({ summary, cycle:{}, promotion:{ promotion_ready:false, blockers:[] } });
  assert.ok(dashboard.remaining_work.total > 0);
  assert.equal(dashboard.execution_allowed, false);
  assert.equal(dashboard.spend_allowed, false);
});
