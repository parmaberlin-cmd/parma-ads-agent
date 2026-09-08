'use strict';

const META_DOMAINS = Object.freeze({
  ORGANIC_PUBLISHING: 'META_ORGANIC_PUBLISHING',
  ADS_EXECUTION: 'META_ADS_EXECUTION',
});

const POLICY_CLASSES = Object.freeze({
  A_AUTONOMOUS_LOW_RISK: 'A_AUTONOMOUS_LOW_RISK',
  B_OPERATOR_APPROVAL_REQUIRED: 'B_OPERATOR_APPROVAL_REQUIRED',
  C_PROTECTED_DENY: 'C_PROTECTED_DENY',
});

const LOW_RISK_META_MUTATIONS = Object.freeze([
  'PAUSE_AD',
  'ENABLE_AGENT_CREATED_AD',
  'PAUSE_ADSET',
  'ENABLE_AGENT_CREATED_ADSET',
  'CREATE_PAUSED_AD_VARIANT',
  'UPDATE_AGENT_CREATED_CREATIVE',
  'SET_AGENT_CREATED_AD_STATUS',
]);

const OPERATOR_APPROVAL_META_MUTATIONS = Object.freeze([
  'BUDGET_CHANGE',
  'BID_STRATEGY_CHANGE',
  'TARGETING_EXPANSION',
  'NEW_ACTIVE_CAMPAIGN',
  'MATERIAL_AUDIENCE_CHANGE',
  'SPEND_INCREASE',
  'NEW_OBJECTIVE',
]);

const PROTECTED_META_MUTATIONS = Object.freeze([
  'BILLING_CHANGE',
  'PAYMENT_METHOD_CHANGE',
  'ACCOUNT_OWNERSHIP_CHANGE',
  'OAUTH_OR_TOKEN_CHANGE',
  'CONVERSION_INTEGRITY_RULE_CHANGE',
  'KILL_SWITCH_CHANGE',
  'SPEND_CAP_CHANGE',
  'SAFETY_POLICY_CHANGE',
]);

const META_MUTATION_CATALOG = Object.freeze({
  ...Object.fromEntries(LOW_RISK_META_MUTATIONS.map(type => [type, POLICY_CLASSES.A_AUTONOMOUS_LOW_RISK])),
  ...Object.fromEntries(OPERATOR_APPROVAL_META_MUTATIONS.map(type => [type, POLICY_CLASSES.B_OPERATOR_APPROVAL_REQUIRED])),
  ...Object.fromEntries(PROTECTED_META_MUTATIONS.map(type => [type, POLICY_CLASSES.C_PROTECTED_DENY])),
});

const META_MUTATION_TYPES = Object.freeze(Object.keys(META_MUTATION_CATALOG));

const REQUIRED_META_MUTATION_FIELDS = Object.freeze([
  'change_id',
  'domain',
  'mutation_type',
  'ad_account_id',
  'object_identifiers',
  'before_state',
  'proposed_after_state',
  'reason',
  'evidence',
  'confidence',
  'risk_class',
  'approval_class',
]);

function classifyMetaMutationType(mutationType) {
  const policyClass = META_MUTATION_CATALOG[mutationType];
  if (!policyClass) {
    return {
      valid: false,
      policy_class: POLICY_CLASSES.C_PROTECTED_DENY,
      protected: true,
      approval_required: false,
      reason: 'unknown_mutation_type',
    };
  }
  return {
    valid: true,
    policy_class: policyClass,
    protected: policyClass === POLICY_CLASSES.C_PROTECTED_DENY,
    approval_required: policyClass === POLICY_CLASSES.B_OPERATOR_APPROVAL_REQUIRED,
    reason: null,
  };
}

function validateMetaMutationRequest(input) {
  const errors = [];
  const missing = REQUIRED_META_MUTATION_FIELDS.filter(field => !Object.prototype.hasOwnProperty.call(input || {}, field));
  if (!input || typeof input !== 'object') return { ok: false, errors: ['invalid_mutation_request'], missing };
  if (!/^[A-Za-z0-9:_-]{1,128}$/.test(String(input.change_id || ''))) errors.push('invalid_change_id');
  if (input.domain !== META_DOMAINS.ADS_EXECUTION) errors.push('invalid_execution_domain');
  if (!META_MUTATION_TYPES.includes(input.mutation_type)) errors.push('unknown_mutation_type');
  if (!/^act_\d{1,30}$/.test(String(input.ad_account_id || ''))) errors.push('invalid_ad_account_id');
  if (!Array.isArray(input.object_identifiers) || input.object_identifiers.length < 1 || input.object_identifiers.length > 20) errors.push('invalid_object_identifiers');
  if (!input.before_state || typeof input.before_state !== 'object' || Array.isArray(input.before_state)) errors.push('before_state_required');
  if (!input.proposed_after_state || typeof input.proposed_after_state !== 'object' || Array.isArray(input.proposed_after_state)) errors.push('proposed_after_state_required');
  if (typeof input.reason !== 'string' || !input.reason.trim()) errors.push('reason_required');
  if (!Array.isArray(input.evidence) || input.evidence.length < 1) errors.push('evidence_required');
  if (!Number.isFinite(Number(input.confidence)) || Number(input.confidence) < 0 || Number(input.confidence) > 1) errors.push('confidence_invalid');
  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(input.risk_class)) errors.push('risk_class_invalid');
  if (!Object.values(POLICY_CLASSES).includes(input.approval_class)) errors.push('approval_class_invalid');
  if (input.expires_at !== undefined && (!Number.isFinite(Date.parse(input.expires_at)))) errors.push('expiry_invalid');
  if (input.max_cost_eur !== undefined && (!Number.isFinite(Number(input.max_cost_eur)) || Number(input.max_cost_eur) < 0)) errors.push('max_cost_invalid');
  return { ok: errors.length === 0, errors, missing, value: errors.length === 0 ? input : null };
}

function createDomainAuthorization({
  domain,
  scope,
  authorizationId,
  expiresAt,
  now = Date.now,
  maxCostEur = 0,
} = {}) {
  if (!Object.values(META_DOMAINS).includes(domain)) throw new Error('invalid_meta_domain');
  if (!scope || typeof scope !== 'string') throw new Error('authorization_scope_required');
  if (!authorizationId || !/^[A-Za-z0-9:_-]{1,200}$/.test(authorizationId)) throw new Error('invalid_authorization_id');
  if (!expiresAt || Date.parse(expiresAt) <= now()) throw new Error('authorization_expiry_invalid');
  if (!Number.isFinite(Number(maxCostEur)) || Number(maxCostEur) < 0) throw new Error('authorization_cost_invalid');
  return {
    schema: 'meta.domain_authorization.v1',
    domain,
    authorization_id: authorizationId,
    scope,
    issued_at: new Date(now()).toISOString(),
    expires_at: new Date(Date.parse(expiresAt)).toISOString(),
    max_cost_eur: Number(maxCostEur),
    spend_allowed: domain === META_DOMAINS.ADS_EXECUTION ? false : false,
    non_transferable: true,
  };
}

function canAuthorizeDomain(auth, requestedDomain, { now = Date.now } = {}) {
  if (!auth || auth.domain !== requestedDomain) return { allowed: false, reason: 'cross_domain_authorization_denied' };
  if (Date.parse(auth.expires_at) <= now()) return { allowed: false, reason: 'authorization_expired' };
  if (auth.max_cost_eur !== 0) return { allowed: false, reason: 'organic_authorization_cannot_authorize_spend' };
  return { allowed: true, reason: 'scoped_domain_authorized' };
}

function buildMetaAccountRestrictionStatus({ overview = {}, issueReport = {} } = {}) {
  const withIssues = Number(overview?.campaign_counts?.with_issues || 0);
  const categories = issueReport?.issue_categories || issueReport?.categories || {};
  const reasons = issueReport?.issue_reasons || {};
  const affectedObjects = Number(issueReport?.affected_objects || issueReport?.objects?.length || 0);
  const accountOrBilling = Boolean(categories.account_or_billing) || Boolean(reasons.account_security_or_payment_restriction);
  const blocking = withIssues > 0 && accountOrBilling;
  return {
    blocking,
    reason: blocking ? 'account_security_or_payment_restriction' : null,
    affected_objects: affectedObjects,
    campaigns_with_issues: withIssues,
    category: blocking ? 'account_or_billing' : null,
  };
}

function buildMetaAdsProductionReadiness({
  restrictionStatus,
  writesEnabled = false,
  spendEnabled = false,
} = {}) {
  if (!restrictionStatus || restrictionStatus.blocking) {
    return {
      status: 'META_ADS_BLOCKED_EXTERNAL',
      writes_allowed: false,
      spend_allowed: false,
      writes_enabled: writesEnabled === true,
      spend_enabled: spendEnabled === true,
      restriction: restrictionStatus || null,
    };
  }
  return {
    status: writesEnabled || spendEnabled ? 'META_ADS_READY_DISABLED' : 'META_ADS_DISABLED',
    writes_allowed: false,
    spend_allowed: false,
    writes_enabled: writesEnabled === true,
    spend_enabled: spendEnabled === true,
    restriction: restrictionStatus,
  };
}

module.exports = {
  META_DOMAINS,
  POLICY_CLASSES,
  LOW_RISK_META_MUTATIONS,
  OPERATOR_APPROVAL_META_MUTATIONS,
  PROTECTED_META_MUTATIONS,
  META_MUTATION_CATALOG,
  META_MUTATION_TYPES,
  REQUIRED_META_MUTATION_FIELDS,
  classifyMetaMutationType,
  validateMetaMutationRequest,
  createDomainAuthorization,
  canAuthorizeDomain,
  buildMetaAccountRestrictionStatus,
  buildMetaAdsProductionReadiness,
};
