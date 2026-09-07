'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');

const sha256 = value => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

const POLICY_CLASSES = Object.freeze({
  A_AUTONOMOUS_LOW_RISK: 'A_AUTONOMOUS_LOW_RISK',
  B_EXPERIMENT_REQUIRES_APPROVAL: 'B_EXPERIMENT_REQUIRES_APPROVAL',
  C_PROTECTED_NEVER_AUTONOMOUS: 'C_PROTECTED_NEVER_AUTONOMOUS',
});

const APPROVAL_MODEL = Object.freeze({
  [POLICY_CLASSES.A_AUTONOMOUS_LOW_RISK]: 'AUTO',
  [POLICY_CLASSES.B_EXPERIMENT_REQUIRES_APPROVAL]: 'OPERATOR_APPROVAL_REQUIRED',
  [POLICY_CLASSES.C_PROTECTED_NEVER_AUTONOMOUS]: 'PROTECTED_DENY',
});

const OUTCOME_HIERARCHY = Object.freeze({
  verified_revenue: 1,
  trusted_reservation_order_phone_action: 2,
  high_intent_digital_action: 3,
  click: 4,
  impression: 5,
});

const LOW_RISK_MUTATION_TYPES = Object.freeze([
  'add_exact_negative_keyword',
  'remove_agent_created_negative_keyword',
  'pause_keyword',
  'enable_agent_paused_keyword',
  'add_controlled_keyword',
  'create_pause_rsa_variant',
  'adjust_ad_schedule_within_business_hours',
  'bounded_geographic_exclusion',
]);

const HIGHER_RISK_MUTATION_TYPES = Object.freeze([
  'match_type_strategy_change',
  'major_targeting_change',
  'bidding_strategy_change',
  'budget_change',
  'campaign_creation',
  'campaign_pause_or_reactivate_material',
]);

const PROTECTED_MUTATION_TYPES = Object.freeze([
  'conversion_action_change',
  'billing_change',
  'payment_method_change',
  'account_ownership_admin_change',
  'oauth_developer_token_change',
  'secrets_change',
  'safety_policy_change',
  'execution_or_spend_guardrail_change',
]);

const MUTATION_CATALOG = Object.freeze({
  ...Object.fromEntries(LOW_RISK_MUTATION_TYPES.map(type => [type, POLICY_CLASSES.A_AUTONOMOUS_LOW_RISK])),
  ...Object.fromEntries(HIGHER_RISK_MUTATION_TYPES.map(type => [type, POLICY_CLASSES.B_EXPERIMENT_REQUIRES_APPROVAL])),
  ...Object.fromEntries(PROTECTED_MUTATION_TYPES.map(type => [type, POLICY_CLASSES.C_PROTECTED_NEVER_AUTONOMOUS])),
});

const KNOWN_MUTATION_TYPES = Object.freeze(Object.keys(MUTATION_CATALOG));

const ROLLBACK_STATUSES = Object.freeze({
  READY: 'ROLLBACK_READY',
  EXECUTING: 'ROLLBACK_EXECUTING',
  VERIFIED: 'ROLLBACK_VERIFIED',
  FAILED: 'ROLLBACK_FAILED',
});

const EXPERIMENT_CLASSES = Object.freeze({
  OPTIMIZATION_TEST: 'OPTIMIZATION_TEST',
  SERENDIPITY_TEST: 'SERENDIPITY_TEST',
});

const EXPERIMENT_LIFECYCLE = Object.freeze([
  'DRAFT',
  'PREFLIGHT',
  'AWAITING_APPROVAL',
  'RUNNING',
  'OBSERVING',
  'KEEP',
  'EXTEND',
  'ROLLBACK',
  'CLOSED',
]);

const KILL_SWITCH_STATES = Object.freeze({
  GLOBAL_ADS_AUTONOMY_DISABLED: 'GLOBAL_ADS_AUTONOMY_DISABLED',
  CAMPAIGN_AUTONOMY_DISABLED: 'CAMPAIGN_AUTONOMY_DISABLED',
  EXPERIMENT_STOP: 'EXPERIMENT_STOP',
  EMERGENCY_ROLLBACK: 'EMERGENCY_ROLLBACK',
});

const DEFAULT_EXPLORATION_POLICY = Object.freeze({
  max_experiment_cost_eur: 0,
  max_daily_experiment_cost_eur: 0,
  max_concurrent_experiments: 0,
  max_budget_delta_percent: 0,
  max_campaign_daily_budget_eur: 0,
  minimum_observation_window_ms: 7 * 24 * 60 * 60 * 1000,
  maximum_experiment_duration_ms: 14 * 24 * 60 * 60 * 1000,
  one_serendipity_for_low_volume_by_default: true,
});

const REQUIRED_MUTATION_FIELDS = Object.freeze([
  'change_id',
  'objective_id',
  'campaign_id',
  'mutation_type',
  'object_identifiers',
  'before_state',
  'proposed_after_state',
  'reason',
  'evidence',
  'confidence',
  'risk_class',
  'approval_class',
]);

const evidenceItemSchema = z.union([
  z.string().min(1).max(1000),
  z.object({
    type: z.string().min(1).max(120),
    reference: z.string().min(1).max(2000),
    captured_at: z.string().datetime().optional(),
  }).passthrough(),
]);

const mutationRequestSchema = z.object({
  change_id: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),
  objective_id: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),
  campaign_id: z.string().regex(/^\d{1,20}$/),
  mutation_type: z.enum(KNOWN_MUTATION_TYPES),
  object_identifiers: z.array(z.string().min(1).max(300)).min(1).max(50),
  before_state: z.record(z.unknown()),
  proposed_after_state: z.record(z.unknown()),
  reason: z.string().min(1).max(2000),
  evidence: z.array(evidenceItemSchema).min(1).max(50),
  confidence: z.number().min(0).max(1),
  risk_class: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  approval_class: z.enum(Object.values(POLICY_CLASSES)),
  experiment_id: z.string().min(1).max(200).optional(),
  max_cost_eur: z.number().nonnegative().safe().optional(),
  expires_at: z.string().datetime().optional(),
}).strict();

function validateMutationRequest(input) {
  const parsed = mutationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })),
      missing: REQUIRED_MUTATION_FIELDS.filter(field => !Object.prototype.hasOwnProperty.call(input || {}, field)),
    };
  }
  return { ok: true, value: parsed.data, missing: [] };
}

function classifyMutation(request) {
  if (!request || typeof request !== 'object') {
    return { valid: false, policy_class: POLICY_CLASSES.C_PROTECTED_NEVER_AUTONOMOUS, reason: 'invalid_request' };
  }
  const catalogClass = MUTATION_CATALOG[request.mutation_type];
  let policyClass = catalogClass || POLICY_CLASSES.C_PROTECTED_NEVER_AUTONOMOUS;
  if (policyClass !== POLICY_CLASSES.C_PROTECTED_NEVER_AUTONOMOUS && request.risk_class === 'CRITICAL') {
    policyClass = POLICY_CLASSES.B_EXPERIMENT_REQUIRES_APPROVAL;
  }
  const approvalClass = APPROVAL_MODEL[policyClass];
  const approvalMismatch = request.approval_class && request.approval_class !== policyClass;
  return {
    valid: Boolean(catalogClass) && !approvalMismatch,
    policy_class: policyClass,
    approval_model: approvalClass,
    protected: policyClass === POLICY_CLASSES.C_PROTECTED_NEVER_AUTONOMOUS,
    approval_required: policyClass === POLICY_CLASSES.B_EXPERIMENT_REQUIRES_APPROVAL,
    reason: approvalMismatch ? 'approval_class_mismatch' : catalogClass ? null : 'unknown_mutation_type',
  };
}

function isProtectedMutation(request) {
  return classifyMutation(request).protected;
}

function outcomeLevel(signal) {
  const key = String(signal || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (key.includes('revenue') || key.includes('verified_sales') || key.includes('real_customer_outcome')) return OUTCOME_HIERARCHY.verified_revenue;
  if (key.includes('reservation') || key.includes('order') || key.includes('phone')) return OUTCOME_HIERARCHY.trusted_reservation_order_phone_action;
  if (key.includes('high_intent') || key.includes('lead') || key.includes('start')) return OUTCOME_HIERARCHY.high_intent_digital_action;
  if (key === 'click') return OUTCOME_HIERARCHY.click;
  if (key === 'impression') return OUTCOME_HIERARCHY.impression;
  return OUTCOME_HIERARCHY.impression;
}

function strongerOutcome(a, b) {
  return outcomeLevel(a) < outcomeLevel(b);
}

function evaluateBusinessOutcome({ baseline = {}, treatment = {} } = {}) {
  const baselineOutcome = baseline.primary_outcome || baseline.outcome || 'impression';
  const treatmentOutcome = treatment.primary_outcome || treatment.outcome || 'impression';
  const outcomeImproved = strongerOutcome(treatmentOutcome, baselineOutcome);
  const ctrWorse = Number(treatment.ctr) < Number(baseline.ctr);
  const cpcWorse = Number(treatment.cpc) > Number(baseline.cpc);
  const beneficial = outcomeImproved;
  return {
    beneficial,
    outcome_improved: outcomeImproved,
    ctr_worse: ctrWorse,
    cpc_worse: cpcWorse,
    reason: beneficial ? 'stronger_business_outcome_evidence' : 'no_stronger_business_outcome_evidence',
    baseline_outcome: baselineOutcome,
    treatment_outcome: treatmentOutcome,
  };
}

function redactSecrets(value, key = '') {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && /(?:token|secret|password|api[_-]?key|authorization|bearer)/i.test(key)) return '[redacted]';
    if (typeof value === 'string' && /(?:token|secret|password|api[_-]?key|authorization|bearer)/i.test(value)) return '[redacted]';
    return value;
  }
  if (Array.isArray(value)) return value.map(item => redactSecrets(item, key));
  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = redactSecrets(childValue, childKey);
  }
  return output;
}

function buildStateSnapshot(objects, { now = Date.now, source = 'controlled_ads_read' } = {}) {
  const capturedAt = new Date(now()).toISOString();
  const normalized = structuredClone(objects);
  return {
    schema: 'google_ads.controlled_state.v1',
    source,
    captured_at: capturedAt,
    objects: normalized,
    digest: sha256({ captured_at: capturedAt, objects: normalized }),
    writes_allowed: false,
    execution_allowed: false,
    spend_allowed: false,
  };
}

function buildInverseMutation(mutation, { reason = 'rollback_inverse_mutation' } = {}) {
  if (!mutation || !mutation.mutation_type) return null;
  const before = structuredClone(mutation.before_state || {});
  const after = structuredClone(mutation.proposed_after_state || {});
  const inverseType = {
    add_exact_negative_keyword: 'remove_agent_created_negative_keyword',
    remove_agent_created_negative_keyword: 'add_exact_negative_keyword',
    pause_keyword: 'enable_agent_paused_keyword',
    enable_agent_paused_keyword: 'pause_keyword',
    add_controlled_keyword: 'remove_agent_created_negative_keyword',
    create_pause_rsa_variant: 'remove_agent_created_negative_keyword',
    adjust_ad_schedule_within_business_hours: 'adjust_ad_schedule_within_business_hours',
    bounded_geographic_exclusion: 'remove_agent_created_negative_keyword',
    budget_change: 'budget_change',
    match_type_strategy_change: 'match_type_strategy_change',
    major_targeting_change: 'major_targeting_change',
    bidding_strategy_change: 'bidding_strategy_change',
    campaign_pause_or_reactivate_material: 'campaign_pause_or_reactivate_material',
    campaign_creation: 'remove_agent_created_negative_keyword',
  }[mutation.mutation_type];
  if (!inverseType) return null;
  return {
    ...mutation,
    change_id: `${mutation.change_id}-rollback`,
    mutation_type: inverseType,
    before_state: after,
    proposed_after_state: before,
    reason,
    evidence: [{ type: 'rollback_plan', reference: `inverse_of:${mutation.change_id}` }],
  };
}

function buildRollbackPlan(mutation, snapshot, { now = Date.now } = {}) {
  const inverse = buildInverseMutation(mutation);
  if (!inverse || !snapshot) {
    return { status: ROLLBACK_STATUSES.FAILED, reason: 'rollback_plan_unavailable', inverse: inverse || null, snapshot_id: snapshot?.version_id || null };
  }
  const classification = classifyMutation(inverse);
  if (!classification.valid || classification.protected) {
    return { status: ROLLBACK_STATUSES.FAILED, reason: 'inverse_mutation_not_allowlisted', inverse, snapshot_id: snapshot.version_id || null };
  }
  return {
    status: ROLLBACK_STATUSES.READY,
    reason: 'inverse_mutation_ready',
    mutation_id: mutation.change_id,
    snapshot_id: snapshot.version_id || null,
    inverse,
    expected_restored_state: structuredClone(mutation.before_state || {}),
    created_at: new Date(now()).toISOString(),
  };
}

function verifyRollbackResult({ expected = {}, actual = {}, snapshot = null } = {}) {
  const mismatches = [];
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    if (!Object.prototype.hasOwnProperty.call(actual, key) || stableStringify(actual[key]) !== stableStringify(expected[key])) {
      mismatches.push({ field: key, expected: expected[key], actual: actual[key] });
    }
  }
  return {
    status: mismatches.length === 0 ? ROLLBACK_STATUSES.VERIFIED : ROLLBACK_STATUSES.FAILED,
    mismatches,
    snapshot_id: snapshot?.version_id || snapshot?.id || null,
    read_after_rollback_required: true,
  };
}

function verifyReadAfterWrite({ expected = {}, actual = {}, readCompletedAt = null } = {}) {
  const mismatches = [];
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    if (!Object.prototype.hasOwnProperty.call(actual, key) || stableStringify(actual[key]) !== stableStringify(expected[key])) {
      mismatches.push({ field: key, expected: expected[key], actual: actual[key] });
    }
  }
  return {
    required: true,
    verified: mismatches.length === 0 && Boolean(readCompletedAt),
    mismatches,
    read_completed_at: readCompletedAt || null,
  };
}

function normalizeExplorationPolicy(overrides = {}) {
  const merged = { ...DEFAULT_EXPLORATION_POLICY, ...(overrides || {}) };
  for (const key of [
    'max_experiment_cost_eur',
    'max_daily_experiment_cost_eur',
    'max_concurrent_experiments',
    'max_budget_delta_percent',
    'max_campaign_daily_budget_eur',
    'minimum_observation_window_ms',
    'maximum_experiment_duration_ms',
  ]) {
    const value = Number(merged[key]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`invalid_exploration_policy_${key}`);
    merged[key] = value;
  }
  return merged;
}

const experimentInputSchema = z.object({
  experiment_class: z.enum(Object.values(EXPERIMENT_CLASSES)),
  hypothesis: z.string().min(1).max(2000),
  reason_for_exploration: z.string().min(1).max(2000),
  baseline: z.record(z.unknown()),
  treatment: z.record(z.unknown()),
  start_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  max_cost_eur: z.number().nonnegative().safe(),
  primary_success_metric: z.string().min(1).max(200),
  secondary_metrics: z.array(z.string().min(1).max(200)).max(20),
  stop_loss_condition: z.string().min(1).max(2000),
  rollback_plan: z.record(z.unknown()),
  confidence_before: z.number().min(0).max(1),
  result_confidence: z.number().min(0).max(1).optional(),
  campaign_id: z.string().regex(/^\d{1,20}$/).optional(),
  low_volume_campaign: z.boolean().optional(),
  daily_budget_eur: z.number().nonnegative().safe().optional(),
}).strict();

function createExperimentDraft(input, { now = Date.now } = {}) {
  const parsed = experimentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`invalid_experiment:${parsed.error.issues.map(issue => `${issue.path.join('.')}:${issue.code}`).join(',')}`);
  }
  const value = parsed.data;
  const clock = now();
  const draft = {
    id: `experiment-${sha256({ ...value, created_at: new Date(clock).toISOString() }).slice(0, 16)}`,
    status: 'DRAFT',
    ...value,
    result_confidence: value.result_confidence ?? null,
    approval_required: true,
    stop_loss_triggered: false,
    created_at: new Date(clock).toISOString(),
    updated_at: new Date(clock).toISOString(),
    outcome_decision: null,
  };
  validateExperimentDates(draft, clock);
  return draft;
}

function validateExperimentDates(experiment, nowValue) {
  const start = Date.parse(experiment.start_at);
  const end = Date.parse(experiment.expires_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('experiment_dates_invalid');
  if (nowValue >= end) throw new Error('experiment_already_expired');
}

function experimentApprovalRequired(experiment) {
  // By default both experiment classes are approval-gated. Autonomous optimization
  // experiments may only be relaxed by a separate, explicit future policy change.
  return experiment.approval_required === true || experiment.experiment_class === EXPERIMENT_CLASSES.SERENDIPITY_TEST;
}

function transitionExperiment(experiment, event, { now = Date.now, approved = false, reason = null } = {}) {
  const value = structuredClone(experiment);
  const clock = now();
  const end = Date.parse(value.expires_at);
  const autoExpired = ['DRAFT', 'PREFLIGHT', 'AWAITING_APPROVAL', 'RUNNING', 'OBSERVING'].includes(value.status) && clock >= end;
  if (autoExpired) {
    value.status = 'CLOSED';
    value.outcome_decision = 'EXPIRED';
    value.stop_loss_triggered = true;
    value.updated_at = new Date(clock).toISOString();
    return value;
  }

  const allowed = {
    DRAFT: ['PREFLIGHT', 'CLOSED'],
    PREFLIGHT: ['AWAITING_APPROVAL', 'RUNNING', 'CLOSED'],
    AWAITING_APPROVAL: ['RUNNING', 'CLOSED'],
    RUNNING: ['OBSERVING', 'CLOSED'],
    OBSERVING: ['KEEP', 'EXTEND', 'ROLLBACK', 'CLOSED'],
    KEEP: ['CLOSED'],
    EXTEND: ['CLOSED'],
    ROLLBACK: ['CLOSED'],
    CLOSED: [],
  }[value.status] || [];

  if (!allowed.includes(event)) throw new Error(`experiment_transition_blocked:${value.status}:${event}`);

  if (value.status === 'DRAFT' && event === 'PREFLIGHT') {
    value.status = 'PREFLIGHT';
  } else if (value.status === 'PREFLIGHT' && event === 'AWAITING_APPROVAL') {
    if (approved) throw new Error('approved_preflight_cannot_move_to_awaiting');
    value.status = 'AWAITING_APPROVAL';
  } else if (value.status === 'PREFLIGHT' && event === 'RUNNING') {
    if (experimentApprovalRequired(value) && !approved) throw new Error('operator_approval_required');
    value.status = 'RUNNING';
  } else if (value.status === 'AWAITING_APPROVAL' && event === 'RUNNING') {
    if (!approved) throw new Error('operator_approval_required');
    value.status = 'RUNNING';
  } else if (value.status === 'RUNNING' && event === 'OBSERVING') {
    value.status = 'OBSERVING';
  } else if (value.status === 'OBSERVING' && ['KEEP', 'EXTEND', 'ROLLBACK'].includes(event)) {
    value.outcome_decision = event;
    value.status = 'CLOSED';
  } else if (event === 'CLOSED') {
    value.status = 'CLOSED';
    value.outcome_decision = value.outcome_decision || reason || 'CLOSED';
  } else if (value.status === 'RUNNING' && event === 'CLOSED') {
    value.status = 'CLOSED';
    value.outcome_decision = reason || 'CLOSED';
  }

  value.updated_at = new Date(clock).toISOString();
  return value;
}

function assertExplorationBudget(experiment, policy = DEFAULT_EXPLORATION_POLICY) {
  const normalized = normalizeExplorationPolicy(policy);
  const blockers = [];
  if (experiment.max_cost_eur > normalized.max_experiment_cost_eur) blockers.push('experiment_cost_cap_exceeded');
  const daily = Number(experiment.daily_budget_eur ?? experiment.max_cost_eur ?? 0);
  if (daily > normalized.max_daily_experiment_cost_eur) blockers.push('daily_experiment_cost_cap_exceeded');
  if (Number(experiment.max_cost_eur || 0) > normalized.max_campaign_daily_budget_eur) blockers.push('campaign_daily_budget_cap_exceeded');
  if (blockers.length) return { ok: false, blockers };
  return { ok: true, blockers: [], policy: normalized };
}

function concurrentExperimentBlocked(experiments = [], candidate, policy = DEFAULT_EXPLORATION_POLICY, excludeId = null) {
  const normalized = normalizeExplorationPolicy(policy);
  if (normalized.max_concurrent_experiments === 0) return { blocked: true, reason: 'experiments_disabled_by_default' };
  const active = experiments.filter(exp => exp.id !== excludeId && exp.status !== 'CLOSED');
  if (active.length >= normalized.max_concurrent_experiments) return { blocked: true, reason: 'concurrent_experiment_cap_exceeded' };
  if (candidate.experiment_class === EXPERIMENT_CLASSES.SERENDIPITY_TEST &&
      normalized.one_serendipity_for_low_volume_by_default &&
      candidate.low_volume_campaign !== false &&
      active.some(exp => exp.experiment_class === EXPERIMENT_CLASSES.SERENDIPITY_TEST)) {
    return { blocked: true, reason: 'single_serendipity_concurrency_for_low_volume' };
  }
  return { blocked: false, reason: null };
}

function buildApprovalPacket(experiment, mutation = null) {
  if (!experiment) throw new Error('experiment_required_for_approval_packet');
  return {
    experiment_id: experiment.id,
    change_id: mutation?.change_id || null,
    what_will_change: mutation ? { mutation_type: mutation.mutation_type, object_identifiers: mutation.object_identifiers } : experiment.treatment,
    why: experiment.hypothesis,
    maximum_financial_exposure_eur: experiment.max_cost_eur,
    duration: { start_at: experiment.start_at, expires_at: experiment.expires_at },
    success_condition: experiment.primary_success_metric,
    rollback_condition: experiment.stop_loss_condition,
    rollback_plan: experiment.rollback_plan,
    approval_scope: 'specific_experiment_or_change',
    permanent_blanket_approval: false,
  };
}

class AdsKillSwitch {
  constructor() {
    this.global = false;
    this.campaigns = new Map();
    this.experiments = new Set();
    this.emergencyRollback = null;
  }

  stopAdsAutonomy({ reason = 'operator_stop' } = {}) {
    this.global = true;
    return { state: KILL_SWITCH_STATES.GLOBAL_ADS_AUTONOMY_DISABLED, reason };
  }

  disableCampaign(campaignId) {
    if (!/^\d{1,20}$/.test(String(campaignId))) throw new Error('invalid_campaign_id');
    this.campaigns.set(String(campaignId), true);
    return { state: KILL_SWITCH_STATES.CAMPAIGN_AUTONOMY_DISABLED, campaign_id: String(campaignId) };
  }

  stopExperiment(experimentId) {
    if (!/^[A-Za-z0-9:_-]{1,200}$/.test(String(experimentId))) throw new Error('invalid_experiment_id');
    this.experiments.add(String(experimentId));
    return { state: KILL_SWITCH_STATES.EXPERIMENT_STOP, experiment_id: String(experimentId) };
  }

  requestEmergencyRollback(changeId) {
    if (!/^[A-Za-z0-9:_-]{1,200}$/.test(String(changeId))) throw new Error('invalid_change_id');
    this.emergencyRollback = String(changeId);
    this.global = true;
    return { state: KILL_SWITCH_STATES.EMERGENCY_ROLLBACK, change_id: String(changeId) };
  }

  isBlocked({ campaign_id = null, experiment_id = null } = {}) {
    const reasons = [];
    if (this.global) reasons.push('GLOBAL_ADS_AUTONOMY_DISABLED');
    if (campaign_id && this.campaigns.get(String(campaign_id))) reasons.push('CAMPAIGN_AUTONOMY_DISABLED');
    if (experiment_id && this.experiments.has(String(experiment_id))) reasons.push('EXPERIMENT_STOP');
    if (this.emergencyRollback) reasons.push('EMERGENCY_ROLLBACK');
    return { blocked: reasons.length > 0, reasons };
  }

  resolveOperatorIntent(text) {
    const normalized = String(text || '').toLowerCase().trim();
    if (/stop\s+ads\s+autonomy/.test(normalized)) return { intent: 'stop_ads_autonomy', action: () => this.stopAdsAutonomy() };
    if (/rollback\s+the\s+last\s+ads\s+change/.test(normalized)) {
      return { intent: 'rollback_last_ads_change', action: () => this.requestEmergencyRollback('LAST_ADS_CHANGE') };
    }
    return { intent: 'unknown', action: null };
  }
}

class ControlledAdsStore {
  constructor({ directory, integrityKey, now = Date.now } = {}) {
    if (!path.isAbsolute(directory) || directory === path.parse(directory).root || !Buffer.isBuffer(integrityKey) || integrityKey.length < 32) {
      throw new Error('invalid_controlled_ads_store');
    }
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const canonical = fs.realpathSync(directory);
    this.directory = canonical;
    this.key = Buffer.from(integrityKey);
    this.file = path.join(canonical, 'controlled-ads-audit.json');
    this.now = now;
    if (!fs.lstatSync(canonical).isDirectory()) throw new Error('unsafe_controlled_ads_store');
    fs.chmodSync(canonical, 0o700);
    this.read();
  }

  mac(payload) {
    return crypto.createHmac('sha256', this.key).update(payload).digest('hex');
  }

  read() {
    let stat;
    try { stat = fs.lstatSync(this.file); } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, sequence: 0, records: [] };
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16 * 1024 * 1024) throw new Error('unsafe_controlled_ads_store');
    const envelope = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (typeof envelope?.payload !== 'string' || typeof envelope.mac !== 'string') throw new Error('controlled_ads_store_corrupt');
    const expected = this.mac(envelope.payload);
    if (crypto.timingSafeEqual(Buffer.from(envelope.mac), Buffer.from(expected)) !== true) throw new Error('controlled_ads_integrity_failed');
    const state = JSON.parse(envelope.payload);
    this.validate(state);
    return state;
  }

  validate(state) {
    if (!state || state.version !== 1 || !Number.isSafeInteger(state.sequence) || state.sequence < 0 || !Array.isArray(state.records)) {
      throw new Error('controlled_ads_store_corrupt');
    }
    let previousHash = sha256('genesis');
    for (const record of state.records) {
      if (!record || typeof record.id !== 'string' || !record.created_at || !record.previous_hash || !record.hash || !record.kind) {
        throw new Error('controlled_ads_store_corrupt');
      }
      if (record.previous_hash !== previousHash) throw new Error('controlled_ads_store_hash_chain_broken');
      if (record.hash !== sha256({ id: record.id, kind: record.kind, created_at: record.created_at, previous_hash: record.previous_hash, payload: record.payload })) {
        throw new Error('controlled_ads_store_hash_chain_broken');
      }
      previousHash = record.hash;
    }
    return state;
  }

  persist(state) {
    this.validate(state);
    const payload = JSON.stringify(state);
    const temporary = path.join(this.directory, `.controlled-ads-${crypto.randomBytes(12).toString('hex')}.tmp`);
    let fd;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ payload, mac: this.mac(payload) }));
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temporary, this.file);
      const dirFd = fs.openSync(this.directory, 'r');
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  append(kind, payload) {
    const allowedKinds = new Set(['state', 'change', 'experiment', 'audit']);
    if (!allowedKinds.has(kind)) throw new Error('invalid_controlled_ads_record_kind');
    const state = this.read();
    const sequence = state.sequence + 1;
    const prefix = { state: 'ADS_STATE', change: 'CHANGE', experiment: 'EXPERIMENT', audit: 'AUDIT' }[kind];
    const id = `${prefix}_${String(sequence).padStart(6, '0')}`;
    const previousHash = state.records.length ? state.records.at(-1).hash : sha256('genesis');
    const record = {
      id,
      kind,
      created_at: new Date(this.now()).toISOString(),
      previous_hash: previousHash,
      payload: redactSecrets(payload),
    };
    record.hash = sha256({ id: record.id, kind: record.kind, created_at: record.created_at, previous_hash: record.previous_hash, payload: record.payload });
    state.sequence = sequence;
    state.records.push(record);
    this.persist(state);
    return structuredClone(record);
  }

  list(kind = null) {
    const records = this.read().records;
    return kind ? records.filter(record => record.kind === kind) : records;
  }

  get(id) {
    return this.read().records.find(record => record.id === id) || null;
  }

  last(kind = null) {
    const records = this.list(kind);
    return records.at(-1) || null;
  }

  verify() {
    try {
      this.validate(this.read());
      return { ok: true, record_count: this.read().records.length };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }
}

class ExperimentEngine {
  constructor({ policy = DEFAULT_EXPLORATION_POLICY, store = null, now = Date.now } = {}) {
    this.policy = normalizeExplorationPolicy(policy);
    this.store = store;
    this.now = now;
    this.experiments = new Map();
  }

  create(input) {
    const draft = createExperimentDraft(input, { now: this.now });
    const budget = assertExplorationBudget(draft, this.policy);
    if (!budget.ok) throw new Error(`experiment_blocked:${budget.blockers.join(',')}`);
    const concurrency = concurrentExperimentBlocked([...this.experiments.values()], draft, this.policy);
    if (draft.status === 'DRAFT' && concurrency.blocked) throw new Error(`experiment_blocked:${concurrency.reason}`);
    this.experiments.set(draft.id, draft);
    if (this.store) this.store.append('experiment', draft);
    return structuredClone(draft);
  }

  transition(id, event, options = {}) {
    const experiment = this.experiments.get(id);
    if (!experiment) throw new Error('experiment_missing');
    const next = transitionExperiment(experiment, event, { now: this.now, approved: options.approved === true, reason: options.reason });
    if (next.status === 'RUNNING') {
      const concurrency = concurrentExperimentBlocked([...this.experiments.values()], next, this.policy, id);
      if (concurrency.blocked) throw new Error(`experiment_blocked:${concurrency.reason}`);
    }
    this.experiments.set(id, next);
    if (this.store) this.store.append('audit', { event: 'experiment_transition', experiment_id: id, from: experiment.status, to: next.status, at: next.updated_at });
    return structuredClone(next);
  }

  approve(id) {
    const experiment = this.experiments.get(id);
    if (!experiment) throw new Error('experiment_missing');
    if (experiment.status === 'DRAFT') {
      let next = this.transition(id, 'PREFLIGHT');
      if (experimentApprovalRequired(next)) next = this.transition(id, 'AWAITING_APPROVAL');
      return this.transition(id, 'RUNNING', { approved: true });
    }
    if (experiment.status === 'PREFLIGHT') return this.transition(id, 'RUNNING', { approved: true });
    if (experiment.status === 'AWAITING_APPROVAL') return this.transition(id, 'RUNNING', { approved: true });
    throw new Error(`experiment_transition_blocked:${experiment.status}:approve`);
  }

  expireAll() {
    const expired = [];
    for (const [id, experiment] of this.experiments) {
      if (['DRAFT', 'PREFLIGHT', 'AWAITING_APPROVAL', 'RUNNING', 'OBSERVING'].includes(experiment.status) && this.now() >= Date.parse(experiment.expires_at)) {
        const next = transitionExperiment(experiment, 'CLOSED', { now: this.now, reason: 'EXPIRED' });
        this.experiments.set(id, next);
        if (this.store) this.store.append('audit', { event: 'experiment_expired', experiment_id: id, at: next.updated_at });
        expired.push(next);
      }
    }
    return expired;
  }

  get(id) {
    return this.experiments.get(id) ? structuredClone(this.experiments.get(id)) : null;
  }

  list() {
    return [...this.experiments.values()].map(experiment => structuredClone(experiment));
  }
}

module.exports = {
  POLICY_CLASSES,
  APPROVAL_MODEL,
  OUTCOME_HIERARCHY,
  LOW_RISK_MUTATION_TYPES,
  HIGHER_RISK_MUTATION_TYPES,
  PROTECTED_MUTATION_TYPES,
  MUTATION_CATALOG,
  KNOWN_MUTATION_TYPES,
  ROLLBACK_STATUSES,
  EXPERIMENT_CLASSES,
  EXPERIMENT_LIFECYCLE,
  KILL_SWITCH_STATES,
  DEFAULT_EXPLORATION_POLICY,
  REQUIRED_MUTATION_FIELDS,
  validateMutationRequest,
  classifyMutation,
  isProtectedMutation,
  outcomeLevel,
  strongerOutcome,
  evaluateBusinessOutcome,
  buildStateSnapshot,
  buildInverseMutation,
  buildRollbackPlan,
  verifyRollbackResult,
  verifyReadAfterWrite,
  normalizeExplorationPolicy,
  createExperimentDraft,
  experimentApprovalRequired,
  transitionExperiment,
  assertExplorationBudget,
  concurrentExperimentBlocked,
  buildApprovalPacket,
  AdsKillSwitch,
  ControlledAdsStore,
  ExperimentEngine,
  stableStringify,
  redactSecrets,
};
