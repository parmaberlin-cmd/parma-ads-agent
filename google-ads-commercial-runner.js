'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { z } = require('zod');
const { ControlledAdsStore, stableStringify } = require('./ads-controlled-execution-core');
const { actionSchema, createOperationalGoogleAdsControl } = require('./google-ads-operational-control');
const { configured, customerFrom } = require('./google-write-path');

const CUSTOMER_ID = '7376153998';
const MODES = new Set(['DRY_RUN', 'EXECUTE_APPROVED_PLAN']);
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const NON_ECONOMIC_ACTIONS = new Set([
  'negative_add', 'negative_remove', 'keyword_create', 'keyword_update', 'keyword_remove',
  'schedule_create', 'schedule_remove', 'rsa_create', 'rsa_update', 'rsa_remove',
  'ad_group_update', 'ad_group_remove', 'campaign_update', 'campaign_remove',
  'geo_add', 'geo_remove', 'language_add', 'language_remove',
]);

const readbackSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CAMPAIGN_NEGATIVE'), text: z.string().min(1).max(80), match_type: z.enum(['EXACT', 'PHRASE']) }).strict(),
  z.object({ kind: z.literal('KEYWORD'), ad_group_id: z.string().regex(/^\d{1,20}$/), text: z.string().min(1).max(80), match_type: z.enum(['EXACT', 'PHRASE', 'BROAD']) }).strict(),
  z.object({ kind: z.literal('RESOURCE_STATUS'), resource_name: z.string().regex(/^customers\/\d+\/(?:campaignCriteria|adGroupCriteria|adGroupAds|adGroups|campaigns)\/[~-]?\d+(?:~[~-]?\d+)?$/) }).strict(),
  z.object({ kind: z.literal('RSA_CONTENT'), ad_group_id: z.string().regex(/^\d{1,20}$/), headlines: z.array(z.string()).min(3).max(15), descriptions: z.array(z.string()).min(2).max(4), final_urls: z.array(z.string().url()).min(1).max(10) }).strict(),
  z.object({ kind: z.literal('AD_SCHEDULE'), day_of_week: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']), start_hour: z.number().int().min(0).max(23), start_minute: z.enum(['ZERO', 'FIFTEEN', 'THIRTY', 'FORTY_FIVE']), end_hour: z.number().int().min(1).max(24), end_minute: z.enum(['ZERO', 'FIFTEEN', 'THIRTY', 'FORTY_FIVE']) }).strict(),
]);

const itemSchema = z.object({
  action: actionSchema,
  readback: readbackSchema,
  before_state: z.record(z.unknown()),
  proposed_after_state: z.record(z.unknown()),
  change_id: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),
  objective_id: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),
  reason: z.string().min(1).max(2000),
  evidence: z.array(z.union([z.string().min(1), z.object({ type: z.string().min(1), reference: z.string().min(1) }).passthrough()])).min(1).max(50),
  confidence: z.number().min(0).max(1).default(1),
}).strict();

const planSchema = z.object({
  schema: z.literal('google_ads.commercial_plan.v1'),
  plan_id: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),
  customer_id: z.literal(CUSTOMER_ID),
  spend_allowed: z.literal(false),
  actions: z.array(itemSchema).min(1).max(50),
}).strict();

function planDigest(plan) {
  return crypto.createHash('sha256').update(stableStringify(plan)).digest('hex');
}

function normalizeEnum(value, mapping = {}) {
  return mapping[String(value)] || String(value || '').toUpperCase();
}

const STATUS = { 2: 'ENABLED', 3: 'PAUSED', 4: 'REMOVED' };
const MATCH = { 2: 'EXACT', 3: 'PHRASE', 4: 'BROAD' };
const DAY = { 2: 'MONDAY', 3: 'TUESDAY', 4: 'WEDNESDAY', 5: 'THURSDAY', 6: 'FRIDAY', 7: 'SATURDAY', 8: 'SUNDAY' };
const MINUTE = { 2: 'ZERO', 3: 'FIFTEEN', 4: 'THIRTY', 5: 'FORTY_FIVE' };
const sorted = values => [...values].map(String).sort();

function assertPlanBindings(plan) {
  const changes = new Set();
  for (const item of plan.actions) {
    if (item.action.campaign_id !== '0' && !/^\d+$/.test(item.action.campaign_id)) throw new Error('invalid_campaign_binding');
    if (!NON_ECONOMIC_ACTIONS.has(item.action.type)) throw new Error('spend_or_creation_action_blocked');
    if (item.action.type === 'campaign_update' && item.action.status === 'ENABLED') throw new Error('campaign_activation_blocked');
    if (changes.has(item.change_id)) throw new Error('duplicate_change_id');
    changes.add(item.change_id);
    const rb = item.readback;
    if (rb.kind === 'CAMPAIGN_NEGATIVE' && item.action.text && (rb.text !== item.action.text || rb.match_type !== item.action.match_type)) throw new Error('readback_action_mismatch');
    if (rb.kind === 'KEYWORD' && item.action.text && (rb.text !== item.action.text || rb.match_type !== item.action.match_type)) throw new Error('readback_action_mismatch');
    if (rb.kind === 'RESOURCE_STATUS' && item.action.resource_name && rb.resource_name !== item.action.resource_name) throw new Error('readback_action_mismatch');
  }
  return plan;
}

function parseAuthorizedPlan(env) {
  let raw;
  try { raw = JSON.parse(env.GOOGLE_ADS_COMMERCIAL_PLAN_JSON || ''); }
  catch { throw new Error('malformed_commercial_plan'); }
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) throw new Error('malformed_commercial_plan');
  const plan = assertPlanBindings(parsed.data);
  const digest = planDigest(plan);
  const approved = String(env.GOOGLE_ADS_COMMERCIAL_APPROVED_PLAN_SHA256 || '').toLowerCase();
  if (!HEX_SHA256.test(approved) || approved !== digest) throw new Error('commercial_plan_not_approved');
  return { plan, digest };
}

function commercialAuditStore({ env = process.env, now = Date.now } = {}) {
  const secret = env.ADS_AUDIT_INTEGRITY_KEY;
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('audit_integrity_key_unavailable');
  const base = env.RAILWAY_VOLUME_MOUNT_PATH || (env.ADS_AUDIT_PATH ? path.dirname(env.ADS_AUDIT_PATH) : null);
  if (!base || !path.isAbsolute(base)) throw new Error('audit_path_unavailable');
  const key = crypto.createHash('sha256').update(`parma-google-ads-commercial-audit-v1:${secret}`).digest();
  return new ControlledAdsStore({ directory: path.join(base, 'parma-ads-audit', 'google-ads-commercial'), integrityKey: key, now });
}

function resourceQuery(resourceName) {
  if (resourceName.includes('/campaignCriteria/')) return ['campaign_criterion', 'campaign_criterion.resource_name', `SELECT campaign_criterion.resource_name, campaign_criterion.status FROM campaign_criterion WHERE campaign_criterion.resource_name = '${resourceName}' LIMIT 1`];
  if (resourceName.includes('/adGroupCriteria/')) return ['ad_group_criterion', 'ad_group_criterion.resource_name', `SELECT ad_group_criterion.resource_name, ad_group_criterion.status FROM ad_group_criterion WHERE ad_group_criterion.resource_name = '${resourceName}' LIMIT 1`];
  if (resourceName.includes('/adGroupAds/')) return ['ad_group_ad', 'ad_group_ad.resource_name', `SELECT ad_group_ad.resource_name, ad_group_ad.status FROM ad_group_ad WHERE ad_group_ad.resource_name = '${resourceName}' LIMIT 1`];
  if (resourceName.includes('/adGroups/')) return ['ad_group', 'ad_group.resource_name', `SELECT ad_group.resource_name, ad_group.status FROM ad_group WHERE ad_group.resource_name = '${resourceName}' LIMIT 1`];
  if (resourceName.includes('/campaigns/')) return ['campaign', 'campaign.resource_name', `SELECT campaign.resource_name, campaign.status FROM campaign WHERE campaign.resource_name = '${resourceName}' LIMIT 1`];
  throw new Error('unsupported_readback_resource');
}

function createCommercialReadState(customer, item) {
  if (!customer || typeof customer.query !== 'function') throw new Error('commercial_read_adapter_unavailable');
  const campaignId = item.action.campaign_id;
  const spec = item.readback;
  return async () => {
    if (spec.kind === 'CAMPAIGN_NEGATIVE') {
      const rows = await customer.query(`SELECT campaign_criterion.resource_name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE AND campaign_criterion.status != 'REMOVED' LIMIT 10000`);
      const found = (rows || []).filter(row => String(row?.campaign_criterion?.keyword?.text || '') === spec.text && normalizeEnum(row?.campaign_criterion?.keyword?.match_type, MATCH) === spec.match_type);
      return { present: found.length > 0, count: found.length, text: spec.text, match_type: spec.match_type };
    }
    if (spec.kind === 'KEYWORD') {
      const rows = await customer.query(`SELECT ad_group.id, ad_group_criterion.resource_name, ad_group_criterion.status, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE campaign.id = ${campaignId} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' LIMIT 10000`);
      const found = (rows || []).filter(row => String(row?.ad_group?.id || '') === spec.ad_group_id && String(row?.ad_group_criterion?.keyword?.text || '') === spec.text && normalizeEnum(row?.ad_group_criterion?.keyword?.match_type, MATCH) === spec.match_type);
      return { present: found.length > 0, count: found.length, statuses: sorted(found.map(row => normalizeEnum(row?.ad_group_criterion?.status, STATUS))), ad_group_id: spec.ad_group_id, text: spec.text, match_type: spec.match_type };
    }
    if (spec.kind === 'RESOURCE_STATUS') {
      const [entity, , query] = resourceQuery(spec.resource_name);
      const rows = await customer.query(query);
      const value = rows?.[0]?.[entity];
      return { present: Boolean(value), resource_name: spec.resource_name, status: value ? normalizeEnum(value.status, STATUS) : null };
    }
    if (spec.kind === 'RSA_CONTENT') {
      const rows = await customer.query(`SELECT ad_group.id, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE campaign.id = ${campaignId} AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD' AND ad_group_ad.status != 'REMOVED' LIMIT 1000`);
      const wanted = stableStringify({ headlines: sorted(spec.headlines), descriptions: sorted(spec.descriptions), final_urls: sorted(spec.final_urls) });
      const found = (rows || []).filter(row => String(row?.ad_group?.id || '') === spec.ad_group_id && stableStringify({
        headlines: sorted((row?.ad_group_ad?.ad?.responsive_search_ad?.headlines || []).map(v => v?.text).filter(Boolean)),
        descriptions: sorted((row?.ad_group_ad?.ad?.responsive_search_ad?.descriptions || []).map(v => v?.text).filter(Boolean)),
        final_urls: sorted(row?.ad_group_ad?.ad?.final_urls || []),
      }) === wanted);
      return { present: found.length > 0, count: found.length, statuses: sorted(found.map(row => normalizeEnum(row?.ad_group_ad?.status, STATUS))), ad_group_id: spec.ad_group_id, headlines: sorted(spec.headlines), descriptions: sorted(spec.descriptions), final_urls: sorted(spec.final_urls) };
    }
    const rows = await customer.query(`SELECT campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.start_minute, campaign_criterion.ad_schedule.end_hour, campaign_criterion.ad_schedule.end_minute FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.type = 'AD_SCHEDULE' AND campaign_criterion.status != 'REMOVED' LIMIT 1000`);
    const found = (rows || []).filter(row => {
      const schedule = row?.campaign_criterion?.ad_schedule || {};
      return normalizeEnum(schedule.day_of_week, DAY) === spec.day_of_week && Number(schedule.start_hour) === spec.start_hour && normalizeEnum(schedule.start_minute, MINUTE) === spec.start_minute && Number(schedule.end_hour) === spec.end_hour && normalizeEnum(schedule.end_minute, MINUTE) === spec.end_minute;
    });
    return { present: found.length > 0, count: found.length, day_of_week: spec.day_of_week, start_hour: spec.start_hour, start_minute: spec.start_minute, end_hour: spec.end_hour, end_minute: spec.end_minute };
  };
}

function alreadyConsumed(store, digest) {
  return store.list('audit').some(record => record.payload?.event === 'commercial_plan_execution_started' && record.payload?.plan_digest === digest);
}

async function runCommercialOneShot({ env = process.env, mode = env.GOOGLE_ADS_COMMERCIAL_STARTUP_MODE, customer = null, store = null, controlFactory = createOperationalGoogleAdsControl, readStateFactory = createCommercialReadState, now = Date.now } = {}) {
  const base = { mode, customer_id: CUSTOMER_ID, writes_executed: 0, provider_write: false, spend_allowed: false, commercial_mutations: 0 };
  try {
    if (!MODES.has(mode)) return { ...base, status: 'DISABLED', blockers: ['commercial_startup_mode_disabled'] };
    const { plan, digest } = parseAuthorizedPlan(env);
    const envCustomer = String(env.GOOGLE_CUSTOMER_ID || '').replace(/\D/g, '');
    if (envCustomer !== CUSTOMER_ID || plan.customer_id !== envCustomer) throw new Error('commercial_customer_mismatch');
    if (env.GOOGLE_ADS_SPEND_ALLOWED === 'true') throw new Error('spend_gate_must_remain_closed');
    if (mode === 'EXECUTE_APPROVED_PLAN' && env.GOOGLE_ADS_COMMERCIAL_EXECUTION_AUTHORIZED !== 'true') throw new Error('commercial_execution_not_authorized');
    if (mode === 'EXECUTE_APPROVED_PLAN' && plan.actions.some(item => item.action.status === 'ENABLED') && env.GOOGLE_ADS_COMMERCIAL_ACTIVATION_AUTHORIZED !== 'true') throw new Error('commercial_activation_not_authorized');
    if (mode === 'EXECUTE_APPROVED_PLAN' && (env.GOOGLE_ADS_WRITE_KILL_SWITCH !== 'false' || env.GOOGLE_ADS_COMMERCIAL_KILL_SWITCH !== 'false')) throw new Error('commercial_kill_switch_closed');
    const activeCustomer = customer || (configured(env) ? customerFrom(env) : null);
    if (!activeCustomer || typeof activeCustomer.query !== 'function' || typeof activeCustomer.mutateResources !== 'function') throw new Error('google_provider_credentials_unavailable');
    const providerCustomer = String(activeCustomer?.credentials?.customer_id || activeCustomer?.customerId || '').replace(/\D/g, '');
    if (providerCustomer && providerCustomer !== CUSTOMER_ID) throw new Error('commercial_customer_mismatch');
    const activeStore = store || commercialAuditStore({ env, now });
    if (mode === 'EXECUTE_APPROVED_PLAN' && alreadyConsumed(activeStore, digest)) throw new Error('commercial_plan_replay_blocked');
    if (mode === 'EXECUTE_APPROVED_PLAN') activeStore.append('audit', { event: 'commercial_plan_execution_started', plan_id: plan.plan_id, plan_digest: digest, customer_id: CUSTOMER_ID, spend_allowed: false });
    const results = [];
    for (const item of plan.actions) {
      const control = controlFactory({
        store: activeStore,
        customer: activeCustomer,
        readState: readStateFactory(activeCustomer, item),
        gates: {
          writes_allowed: mode === 'EXECUTE_APPROVED_PLAN',
          execution_authorized: mode === 'EXECUTE_APPROVED_PLAN',
          spend_allowed: false,
          economic_authorized: false,
          activation_authorized: mode === 'EXECUTE_APPROVED_PLAN' && env.GOOGLE_ADS_COMMERCIAL_ACTIVATION_AUTHORIZED === 'true',
        },
        now,
      });
      const result = mode === 'DRY_RUN' ? await control.dryRun(item) : await control.execute(item);
      results.push({ change_id: item.change_id, status: result.status, provider_write: result.provider_write === true, writes_executed: result.writes_executed || 0 });
      if (!['SIMULATED_VERIFIED', 'VERIFIED'].includes(result.status)) throw new Error(`commercial_action_failed:${item.change_id}:${result.status}`);
    }
    const writes = results.reduce((sum, result) => sum + result.writes_executed, 0);
    activeStore.append('audit', { event: mode === 'DRY_RUN' ? 'commercial_plan_dry_run_completed' : 'commercial_plan_execution_completed', plan_id: plan.plan_id, plan_digest: digest, customer_id: CUSTOMER_ID, result_count: results.length, writes_executed: writes, spend_allowed: false });
    return { ...base, status: mode === 'DRY_RUN' ? 'DRY_RUN_VERIFIED' : 'VERIFIED', plan_id: plan.plan_id, plan_digest: digest, action_count: results.length, results, provider_credentials_internal: true, writes_executed: writes, provider_write: results.some(result => result.provider_write), commercial_mutations: writes };
  } catch (error) {
    return { ...base, status: 'BLOCKED', blockers: [String(error?.message || 'commercial_runner_failed').split('\n')[0]] };
  }
}

module.exports = { CUSTOMER_ID, MODES, planSchema, planDigest, parseAuthorizedPlan, commercialAuditStore, createCommercialReadState, runCommercialOneShot };
