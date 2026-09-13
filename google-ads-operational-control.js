'use strict';

// Operational Google Ads writes are deliberately composed through the existing
// controlled mutation gateway. This module contains no route and enables no
// production write by importing it.
const { z } = require('zod');
const { createGoogleAdsMutationGateway, POLICY_CLASSES } = require('./google-ads-mutation-gateway');
const { AdsKillSwitch, verifyReadAfterWrite } = require('./ads-controlled-execution-core');

const id = z.string().regex(/^\d{1,20}$/);
const resource = z.string().regex(/^customers\/\d{1,20}\/(?:campaigns|campaignBudgets|adGroups|adGroupCriteria|adGroupAds|campaignCriteria)\/[~-]?\d+(?:~[~-]?\d+)?$/);
const text = z.string().trim().min(1).max(80);
const status = z.enum(['PAUSED', 'ENABLED']);
const matchType = z.enum(['EXACT', 'PHRASE', 'BROAD']);
const minute = z.enum(['ZERO', 'FIFTEEN', 'THIRTY', 'FORTY_FIVE']);
const day = z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);

const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['negative_add']), campaign_id: id, text, match_type: z.enum(['EXACT', 'PHRASE']) }).strict(),
  z.object({ type: z.enum(['negative_remove']), campaign_id: id, resource_name: resource }).strict(),
  z.object({ type: z.enum(['keyword_create']), campaign_id: id, ad_group_resource_name: resource, text, match_type: matchType, status: z.literal('PAUSED') }).strict(),
  z.object({ type: z.enum(['keyword_update']), campaign_id: id, resource_name: resource, status }).strict(),
  z.object({ type: z.enum(['keyword_remove']), campaign_id: id, resource_name: resource }).strict(),
  z.object({ type: z.enum(['schedule_create']), campaign_id: id, day_of_week: day, start_hour: z.number().int().min(0).max(23), start_minute: minute, end_hour: z.number().int().min(1).max(24), end_minute: minute }).strict(),
  z.object({ type: z.enum(['schedule_remove']), campaign_id: id, resource_name: resource }).strict(),
  z.object({ type: z.enum(['rsa_create']), campaign_id: id, ad_group_resource_name: resource, headlines: z.array(z.string().trim().min(1).max(30)).min(3).max(15), descriptions: z.array(z.string().trim().min(1).max(90)).min(2).max(4), final_urls: z.array(z.string().url()).min(1).max(10), status: z.literal('PAUSED') }).strict(),
  z.object({ type: z.enum(['rsa_update']), campaign_id: id, resource_name: resource, status }).strict(),
  z.object({ type: z.enum(['rsa_remove']), campaign_id: id, resource_name: resource }).strict(),
  z.object({ type: z.enum(['ad_group_create']), campaign_id: id, campaign_resource_name: resource, name: z.string().trim().min(1).max(255), cpc_bid_micros: z.number().int().nonnegative().safe().optional(), status: z.literal('PAUSED') }).strict(),
  z.object({ type: z.enum(['ad_group_update']), campaign_id: id, resource_name: resource, name: z.string().trim().min(1).max(255).optional(), status: status.optional() }).strict(),
  z.object({ type: z.enum(['ad_group_remove']), campaign_id: id, resource_name: resource }).strict(),
  z.object({ type: z.enum(['campaign_create']), campaign_id: z.literal('0'), resource_name: resource, name: z.string().trim().min(1).max(128), campaign_budget: z.string().regex(/^customers\/\d{1,20}\/campaignBudgets\/[~-]?\d+$/), advertising_channel_type: z.literal('SEARCH'), status: z.literal('PAUSED') }).strict(),
  z.object({ type: z.enum(['campaign_update']), campaign_id: id, resource_name: resource, name: z.string().trim().min(1).max(128).optional(), status: status.optional() }).strict(),
  z.object({ type: z.enum(['campaign_remove']), campaign_id: id, resource_name: resource }).strict(),
  z.object({ type: z.enum(['campaign_budget_create']), campaign_id: z.literal('0'), resource_name: resource, name: z.string().trim().min(1).max(255), amount_micros: z.number().int().positive().safe(), explicitly_shared: z.literal(false) }).strict(),
  z.object({ type: z.enum(['campaign_budget_remove']), campaign_id: z.literal('0'), resource_name: resource }).strict(),
  z.object({ type: z.enum(['geo_add']), campaign_id: id, campaign_resource_name: resource, geo_target_constant: z.string().regex(/^geoTargetConstants\/\d+$/), negative: z.boolean().default(false) }).strict(),
  z.object({ type: z.enum(['geo_remove']), campaign_id: id, resource_name: resource }).strict(),
  z.object({ type: z.enum(['language_add']), campaign_id: id, campaign_resource_name: resource, language_constant: z.string().regex(/^languageConstants\/\d+$/) }).strict(),
  z.object({ type: z.enum(['language_remove']), campaign_id: id, resource_name: resource }).strict(),
]);

const TYPE_POLICY = Object.freeze({
  negative_add: ['add_negative_keyword', 'LOW'], negative_remove: ['remove_agent_created_negative_keyword', 'LOW'],
  keyword_create: ['create_keyword', 'LOW'], keyword_update: ['update_keyword', 'LOW'], keyword_remove: ['remove_agent_created_keyword', 'LOW'],
  schedule_create: ['create_ad_schedule', 'LOW'], schedule_remove: ['remove_ad_schedule', 'LOW'],
  rsa_create: ['create_paused_rsa', 'LOW'], rsa_update: ['update_rsa', 'LOW'], rsa_remove: ['remove_agent_created_rsa', 'LOW'],
  ad_group_create: ['create_paused_ad_group', 'LOW'], ad_group_update: ['update_ad_group', 'LOW'], ad_group_remove: ['remove_agent_created_ad_group', 'LOW'],
  campaign_create: ['campaign_creation', 'MEDIUM'], campaign_update: ['update_campaign', 'MEDIUM'], campaign_remove: ['remove_agent_created_campaign', 'MEDIUM'],
  campaign_budget_create: ['campaign_budget_creation', 'MEDIUM'], campaign_budget_remove: ['remove_agent_created_campaign_budget', 'MEDIUM'],
  geo_add: ['add_geo_target', 'LOW'], geo_remove: ['remove_geo_target', 'LOW'], language_add: ['add_language_target', 'LOW'], language_remove: ['remove_language_target', 'LOW'],
});

function parseAction(input) {
  const action = actionSchema.parse(input);
  const names = Object.entries(action).filter(([key, value]) =>
    (key === 'resource_name' || key.endsWith('_resource_name') || key === 'campaign_budget') && typeof value === 'string');
  const customers = new Set(names.map(([, value]) => value.match(/^customers\/(\d+)/)?.[1]).filter(Boolean));
  if (customers.size > 1) throw new Error('cross_customer_operation_blocked');
  return action;
}

function entityFromResourceName(name) {
  if (name.includes('/campaignCriteria/')) return 'campaign_criterion';
  if (name.includes('/campaignBudgets/')) return 'campaign_budget';
  if (name.includes('/adGroupCriteria/')) return 'ad_group_criterion';
  if (name.includes('/adGroupAds/')) return 'ad_group_ad';
  if (name.includes('/adGroups/')) return 'ad_group';
  if (name.includes('/campaigns/')) return 'campaign';
  throw new Error('unsupported_resource_name');
}

function compileOperation(input) {
  const action = parseAction(input);
  if ((action.type === 'ad_group_update' || action.type === 'campaign_update') && !action.name && !action.status) throw new Error(`${action.type}_empty`);
  const remove = resourceName => ({ entity: entityFromResourceName(resourceName), operation: 'remove', resource: resourceName });
  if (/_remove$/.test(action.type)) return remove(action.resource_name);
  if (action.type === 'negative_add') return { entity: 'campaign_criterion', operation: 'create', resource: { campaign: `customers/${action.campaign_id}/campaigns/${action.campaign_id}`, negative: true, keyword: { text: action.text, match_type: action.match_type } } };
  if (action.type === 'keyword_create') return { entity: 'ad_group_criterion', operation: 'create', resource: { ad_group: action.ad_group_resource_name, status: action.status, negative: false, keyword: { text: action.text, match_type: action.match_type } } };
  if (action.type === 'keyword_update') return { entity: 'ad_group_criterion', operation: 'update', resource: { resource_name: action.resource_name, status: action.status } };
  if (action.type === 'schedule_create') return { entity: 'campaign_criterion', operation: 'create', resource: { campaign: `customers/${action.campaign_id}/campaigns/${action.campaign_id}`, ad_schedule: { day_of_week: action.day_of_week, start_hour: action.start_hour, start_minute: action.start_minute, end_hour: action.end_hour, end_minute: action.end_minute } } };
  if (action.type === 'rsa_create') return { entity: 'ad_group_ad', operation: 'create', resource: { ad_group: action.ad_group_resource_name, status: 'PAUSED', ad: { final_urls: action.final_urls, responsive_search_ad: { headlines: action.headlines.map(value => ({ text: value })), descriptions: action.descriptions.map(value => ({ text: value })) } } } };
  if (action.type === 'rsa_update') return { entity: 'ad_group_ad', operation: 'update', resource: { resource_name: action.resource_name, status: action.status } };
  if (action.type === 'ad_group_create') return { entity: 'ad_group', operation: 'create', resource: { campaign: action.campaign_resource_name, name: action.name, status: 'PAUSED', type: 'SEARCH_STANDARD', ...(action.cpc_bid_micros === undefined ? {} : { cpc_bid_micros: action.cpc_bid_micros }) } };
  if (action.type === 'ad_group_update') return { entity: 'ad_group', operation: 'update', resource: { resource_name: action.resource_name, ...(action.name ? { name: action.name } : {}), ...(action.status ? { status: action.status } : {}) } };
  if (action.type === 'campaign_create') return { entity: 'campaign', operation: 'create', resource: { resource_name: action.resource_name, name: action.name, campaign_budget: action.campaign_budget, advertising_channel_type: 'SEARCH', status: 'PAUSED', manual_cpc: {} } };
  if (action.type === 'campaign_budget_create') return { entity: 'campaign_budget', operation: 'create', resource: { resource_name: action.resource_name, name: action.name, amount_micros: action.amount_micros, explicitly_shared: false } };
  if (action.type === 'campaign_update') return { entity: 'campaign', operation: 'update', resource: { resource_name: action.resource_name, ...(action.name ? { name: action.name } : {}), ...(action.status ? { status: action.status } : {}) } };
  if (action.type === 'geo_add') return { entity: 'campaign_criterion', operation: 'create', resource: { campaign: action.campaign_resource_name, negative: action.negative, location: { geo_target_constant: action.geo_target_constant } } };
  if (action.type === 'language_add') return { entity: 'campaign_criterion', operation: 'create', resource: { campaign: action.campaign_resource_name, language: { language_constant: action.language_constant } } };
  throw new Error('unsupported_operational_action');
}

function buildMutationRequest({ action: rawAction, before_state, proposed_after_state, change_id, objective_id, reason, evidence, confidence = 1 }) {
  const action = parseAction(rawAction);
  const [mutationType, risk] = TYPE_POLICY[action.type];
  const approval = risk === 'LOW' ? POLICY_CLASSES.A_AUTONOMOUS_LOW_RISK : POLICY_CLASSES.B_EXPERIMENT_REQUIRES_APPROVAL;
  return {
    change_id, objective_id, campaign_id: action.campaign_id, mutation_type: mutationType,
    object_identifiers: [action.resource_name || action.campaign_resource_name || action.ad_group_resource_name || `campaign:${action.campaign_id}`],
    before_state, proposed_after_state, reason, evidence, confidence, risk_class: risk, approval_class: approval,
  };
}

function createOperationalGoogleAdsControl({ store, customer, readState, gates = {}, killSwitch = new AdsKillSwitch(), now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), readBackAttempts = 5, readBackDelayMs = 500 } = {}) {
  if (!customer || typeof customer.mutateResources !== 'function' || typeof readState !== 'function') throw new Error('operational_google_ads_dependencies_required');
  if (!Number.isInteger(readBackAttempts) || readBackAttempts < 1 || readBackAttempts > 10 || !Number.isInteger(readBackDelayMs) || readBackDelayMs < 0 || readBackDelayMs > 5000 || typeof sleep !== 'function') throw new Error('invalid_operational_read_back_policy');
  const trustedGates = Object.freeze({
    writes_allowed: gates.writes_allowed === true,
    execution_authorized: gates.execution_authorized === true,
    spend_allowed: gates.spend_allowed === true,
    activation_authorized: gates.activation_authorized === true,
    economic_authorized: gates.economic_authorized === true,
  });
  const pendingActions = new Map();
  const gateway = createGoogleAdsMutationGateway({
    store, killSwitch, now, writesEnabled: trustedGates.writes_allowed && trustedGates.execution_authorized,
    readBefore: mutation => readState(mutation, { phase: 'before' }),
    readAfter: async mutation => {
      let actual = {};
      for (let attempt = 1; attempt <= readBackAttempts; attempt += 1) {
        actual = await readState(mutation, { phase: 'after', attempt });
        if (verifyReadAfterWrite({ expected: mutation.proposed_after_state, actual, readCompletedAt: new Date(now()).toISOString() }).verified) return actual;
        if (attempt < readBackAttempts) await sleep(readBackDelayMs * attempt);
      }
      return actual;
    },
    applyMutation: async mutation => {
      const action = pendingActions.get(mutation.change_id);
      if (!action) throw new Error('operational_action_context_missing');
      const operation = compileOperation(action);
      await customer.mutateResources([operation], { validate_only: true, partial_failure: false });
      return customer.mutateResources([operation], { validate_only: false, partial_failure: false });
    },
  });

  function safetyBlock(action) {
    if (!trustedGates.writes_allowed) return 'writes_disabled_by_default';
    if (!trustedGates.execution_authorized) return 'execution_authorization_required';
    if (action.status === 'ENABLED' && !trustedGates.activation_authorized) return 'activation_authorization_required';
    if (action.type.startsWith('campaign_budget_') && (!trustedGates.spend_allowed || !trustedGates.economic_authorized)) return 'spend_authorization_required';
    return null;
  }
  async function prepare(input) { return gateway.preflight(buildMutationRequest(input)); }
  async function dryRun(input, options) { return gateway.simulate(buildMutationRequest(input), options); }
  async function execute(input) {
    const action = parseAction(input.action);
    const blocker = safetyBlock(action);
    if (blocker) return { accepted: false, status: 'BLOCKED', blockers: [blocker], writes_executed: 0, provider_write: false };
    if (pendingActions.has(input.change_id)) return { accepted: false, status: 'BLOCKED', blockers: ['change_already_executing'], writes_executed: 0, provider_write: false };
    pendingActions.set(input.change_id, action);
    try { return await gateway.execute(buildMutationRequest(input), { approved: true }); }
    finally { pendingActions.delete(input.change_id); }
  }
  return { prepare, dryRun, execute, compileOperation, status: () => ({ ...gateway.status(), ...trustedGates }) };
}

module.exports = { actionSchema, compileOperation, buildMutationRequest, createOperationalGoogleAdsControl };
