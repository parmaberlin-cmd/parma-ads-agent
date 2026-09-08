'use strict';

const { normalizeMetaSpendPolicy, DEFAULT_META_SPEND_POLICY } = require('./meta-ads-spend-control');

const META_EXPERIMENT_CLASSES = Object.freeze({
  OPTIMIZATION_TEST: 'OPTIMIZATION_TEST',
  SERENDIPITY_TEST: 'SERENDIPITY_TEST',
});

const META_EXPERIMENT_LIFECYCLE = Object.freeze([
  'DRAFT',
  'PREFLIGHT',
  'AWAITING_APPROVAL',
  'RUNNING',
  'OBSERVING',
  'KEEP',
  'ROLLBACK',
  'CLOSED',
]);

const OUTCOME_HIERARCHY = Object.freeze({
  real_revenue_or_customer: 1,
  trusted_booking_order_phone: 2,
  high_intent_action: 3,
  click: 4,
  impression: 5,
});

function outcomeLevel(value) {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (key.includes('revenue') || key.includes('customer') || key.includes('sale')) return OUTCOME_HIERARCHY.real_revenue_or_customer;
  if (key.includes('booking') || key.includes('order') || key.includes('phone')) return OUTCOME_HIERARCHY.trusted_booking_order_phone;
  if (key.includes('lead') || key.includes('intent') || key.includes('start')) return OUTCOME_HIERARCHY.high_intent_action;
  if (key === 'click') return OUTCOME_HIERARCHY.click;
  return OUTCOME_HIERARCHY.impression;
}

function strongerBusinessOutcome(a, b) {
  return outcomeLevel(a) < outcomeLevel(b);
}

function validateMetaExperiment(input) {
  const required = [
    'experiment_id',
    'experiment_class',
    'objective',
    'hypothesis',
    'ad_account_id',
    'scope',
    'before_snapshot',
    'planned_mutation',
    'max_spend_eur',
    'start_at',
    'expires_at',
    'stop_conditions',
    'success_metrics',
    'rollback_plan',
    'primary_business_outcome',
  ];
  const missing = required.filter(field => !Object.prototype.hasOwnProperty.call(input || {}, field));
  const errors = [];
  if (!/^[A-Za-z0-9:_-]{1,200}$/.test(String(input?.experiment_id || ''))) errors.push('invalid_experiment_id');
  if (!Object.values(META_EXPERIMENT_CLASSES).includes(input?.experiment_class)) errors.push('invalid_experiment_class');
  if (!/^act_\d{1,30}$/.test(String(input?.ad_account_id || ''))) errors.push('invalid_ad_account_id');
  if (!Array.isArray(input?.scope) || input.scope.length < 1) errors.push('experiment_scope_required');
  if (!input?.before_snapshot || typeof input.before_snapshot !== 'object') errors.push('before_snapshot_required');
  if (!input?.planned_mutation || typeof input.planned_mutation !== 'object') errors.push('planned_mutation_required');
  if (!Number.isFinite(Number(input?.max_spend_eur)) || Number(input.max_spend_eur) < 0) errors.push('max_spend_invalid');
  if (!Array.isArray(input?.stop_conditions) || input.stop_conditions.length < 1) errors.push('stop_conditions_required');
  if (!Array.isArray(input?.success_metrics) || input.success_metrics.length < 1) errors.push('success_metrics_required');
  if (!input?.rollback_plan || typeof input.rollback_plan !== 'object') errors.push('rollback_plan_required');
  if (!Number.isFinite(Date.parse(input?.start_at || ''))) errors.push('start_at_invalid');
  if (!Number.isFinite(Date.parse(input?.expires_at || ''))) errors.push('expiry_invalid');
  if (input && Date.parse(input.expires_at) <= Date.parse(input.start_at)) errors.push('expiry_must_follow_start');
  return { ok: errors.length === 0, errors, missing };
}

function createMetaExperiment(input, { now = Date.now } = {}) {
  const validation = validateMetaExperiment(input);
  if (!validation.ok) throw new Error(`invalid_meta_experiment:${validation.errors.join(',')}`);
  if (now() >= Date.parse(input.expires_at)) throw new Error('experiment_already_expired');
  return {
    ...structuredClone(input),
    status: 'DRAFT',
    created_at: new Date(now()).toISOString(),
    updated_at: new Date(now()).toISOString(),
    approval_required: true,
    stop_loss_triggered: false,
    outcome_decision: null,
    business_outcome_level: outcomeLevel(input.primary_business_outcome),
  };
}

function assertMetaExperimentBudget(experiment, policy = DEFAULT_META_SPEND_POLICY) {
  const normalized = policy.enabled !== undefined ? policy : { ...DEFAULT_META_SPEND_POLICY, ...policy };
  const cost = Number(experiment.max_spend_eur || 0);
  const blockers = [];
  if (normalized.enabled !== true) blockers.push('spend_disabled_by_default');
  if (cost > normalized.max_experiment_spend_eur) blockers.push('experiment_spend_cap_exceeded');
  if (cost > normalized.max_daily_spend_eur) blockers.push('daily_spend_cap_exceeded');
  if (cost > normalized.max_monthly_spend_eur) blockers.push('monthly_spend_cap_exceeded');
  if (experiment.experiment_class === META_EXPERIMENT_CLASSES.SERENDIPITY_TEST && normalized.max_experiment_spend_eur <= 0) blockers.push('serendipity_spend_disabled');
  return { ok: blockers.length === 0, blockers, cost_eur: cost };
}

function transitionMetaExperiment(experiment, event, { now = Date.now, approved = false, reason = null } = {}) {
  const value = structuredClone(experiment);
  const clock = now();
  if (clock >= Date.parse(value.expires_at)) {
    value.status = 'CLOSED';
    value.outcome_decision = 'EXPIRED';
    value.stop_loss_triggered = true;
    value.updated_at = new Date(clock).toISOString();
    return value;
  }
  const allowed = {
    DRAFT: ['PREFLIGHT', 'CLOSED'],
    PREFLIGHT: ['AWAITING_APPROVAL', 'CLOSED'],
    AWAITING_APPROVAL: ['RUNNING', 'CLOSED'],
    RUNNING: ['OBSERVING', 'CLOSED'],
    OBSERVING: ['KEEP', 'ROLLBACK', 'CLOSED'],
    KEEP: ['CLOSED'],
    ROLLBACK: ['CLOSED'],
    CLOSED: [],
  }[value.status] || [];
  if (!allowed.includes(event)) throw new Error(`experiment_transition_blocked:${value.status}:${event}`);
  if (event === 'RUNNING' && !approved) throw new Error('operator_approval_required');
  value.status = event;
  value.outcome_decision = event === 'KEEP' || event === 'ROLLBACK' ? event : null;
  value.stop_loss_triggered = event === 'ROLLBACK' || event === 'CLOSED';
  value.updated_at = new Date(clock).toISOString();
  if (reason && event === 'CLOSED') value.outcome_decision = reason;
  return value;
}

function serendipityExperimentBlocked(activeExperiments = [], candidate, policy = DEFAULT_META_SPEND_POLICY) {
  if (candidate.experiment_class !== META_EXPERIMENT_CLASSES.SERENDIPITY_TEST) return { blocked: false, reason: null };
  if (policy.enabled !== true) return { blocked: true, reason: 'spend_disabled_by_default' };
  const existingSerendipity = activeExperiments.some(exp =>
    exp.experiment_class === META_EXPERIMENT_CLASSES.SERENDIPITY_TEST && !['CLOSED', 'ROLLBACK'].includes(exp.status)
  );
  if (existingSerendipity) return { blocked: true, reason: 'single_serendipity_concurrency' };
  return { blocked: false, reason: null };
}

module.exports = {
  META_EXPERIMENT_CLASSES,
  META_EXPERIMENT_LIFECYCLE,
  OUTCOME_HIERARCHY,
  outcomeLevel,
  strongerBusinessOutcome,
  validateMetaExperiment,
  createMetaExperiment,
  assertMetaExperimentBudget,
  transitionMetaExperiment,
  serendipityExperimentBlocked,
};
