'use strict';

const {
  POLICY_CLASSES,
  classifyMetaMutationType,
} = require('./meta-execution-domains');

const DEFAULT_META_SPEND_POLICY = Object.freeze({
  enabled: false,
  max_daily_spend_eur: 0,
  max_experiment_spend_eur: 0,
  max_monthly_spend_eur: 0,
  global_kill_switch: true,
});

function parseNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeMetaSpendPolicy(env = process.env) {
  return {
    enabled: env.META_ADS_SPEND_ENABLED === 'true',
    max_daily_spend_eur: parseNonNegative(env.META_ADS_MAX_DAILY_SPEND_EUR),
    max_experiment_spend_eur: parseNonNegative(env.META_ADS_MAX_EXPERIMENT_SPEND_EUR),
    max_monthly_spend_eur: parseNonNegative(env.META_ADS_MAX_MONTHLY_SPEND_EUR),
    global_kill_switch: env.META_ADS_GLOBAL_KILL_SWITCH !== 'false',
    campaign_kill_switch: env.META_ADS_CAMPAIGN_KILL_SWITCH === 'true',
    experiment_kill_switch: env.META_ADS_EXPERIMENT_KILL_SWITCH === 'true',
  };
}

function createMetaSpendAuthorization({
  authorizationId,
  adAccountId,
  campaignIds,
  maxCostEur,
  expiresAt,
  now = Date.now,
} = {}) {
  if (!authorizationId || !/^[A-Za-z0-9:_-]{1,200}$/.test(authorizationId)) throw new Error('invalid_spend_authorization_id');
  if (!/^act_\d{1,30}$/.test(String(adAccountId || ''))) throw new Error('invalid_ad_account_id');
  if (!Array.isArray(campaignIds) || campaignIds.length < 1 || campaignIds.length > 100) throw new Error('spend_campaign_allowlist_required');
  if (campaignIds.some(id => !/^\d{1,30}$/.test(String(id)))) throw new Error('invalid_spend_campaign_id');
  if (!Number.isFinite(Number(maxCostEur)) || Number(maxCostEur) <= 0) throw new Error('spend_max_cost_required');
  if (!expiresAt || Date.parse(expiresAt) <= now()) throw new Error('spend_authorization_expiry_invalid');
  return {
    schema: 'meta.spend_authorization.v1',
    authorization_id: authorizationId,
    ad_account_id: adAccountId,
    campaign_ids: campaignIds.map(String),
    max_cost_eur: Number(maxCostEur),
    expires_at: new Date(Date.parse(expiresAt)).toISOString(),
    issued_at: new Date(now()).toISOString(),
    spend_changes_allowed: true,
    non_transferable: true,
    single_use: true,
  };
}

function assertMetaSpendAuthorization({
  policy,
  authorization,
  mutation,
  now = Date.now,
} = {}) {
  const blockers = [];
  if (!policy) blockers.push('spend_policy_required');
  if (policy.enabled !== true) blockers.push('spend_disabled_by_default');
  if (policy.global_kill_switch !== false) blockers.push('meta_ads_global_kill_switch_blocked');
  if (policy.campaign_kill_switch === true) blockers.push('meta_ads_campaign_kill_switch_blocked');
  if (policy.experiment_kill_switch === true) blockers.push('meta_ads_experiment_kill_switch_blocked');
  if (!authorization) blockers.push('spend_authorization_required');

  const classification = classifyMetaMutationType(mutation?.mutation_type);
  const spendChange = mutation?.max_cost_eur > 0 || mutation?.mutation_type === 'SPEND_INCREASE' || classification?.approval_required;
  if (!spendChange) return { allowed: true, reason: 'not_a_spend_change', blockers: [] };

  if (authorization) {
    if (authorization.ad_account_id !== mutation.ad_account_id) blockers.push('spend_ad_account_mismatch');
    if (!authorization.campaign_ids.includes(String(mutation.campaign_id || mutation.object_identifiers?.[0] || ''))) blockers.push('campaign_not_allowlisted_for_spend');
    if (Number(mutation.max_cost_eur || 0) > Number(authorization.max_cost_eur)) blockers.push('spend_authorization_max_cost_exceeded');
    if (Date.parse(authorization.expires_at) <= now()) blockers.push('spend_authorization_expired');
  }
  if (policy.enabled === true && authorization) {
    const cost = Number(mutation.max_cost_eur || 0);
    if (cost > policy.max_experiment_spend_eur) blockers.push('experiment_spend_cap_exceeded');
    if (cost > policy.max_daily_spend_eur) blockers.push('daily_spend_cap_exceeded');
    if (cost > policy.max_monthly_spend_eur) blockers.push('monthly_spend_cap_exceeded');
  }
  return { allowed: blockers.length === 0, reason: blockers[0] || 'scoped_spend_authorized', blockers };
}

function spendReadiness(env = process.env) {
  const policy = normalizeMetaSpendPolicy(env);
  return {
    enabled: policy.enabled,
    spend_allowed: false,
    default_spend_allowed: false,
    policy,
    blockers: policy.enabled === true && policy.global_kill_switch !== false ? ['global_kill_switch_not_explicitly_false'] : [],
  };
}

module.exports = {
  DEFAULT_META_SPEND_POLICY,
  normalizeMetaSpendPolicy,
  createMetaSpendAuthorization,
  assertMetaSpendAuthorization,
  spendReadiness,
};
