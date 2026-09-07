'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createNegativeRestAdapter } = require('./google-negative-rest-adapter');
const { ControlledAdsStore, AdsKillSwitch, POLICY_CLASSES } = require('./ads-controlled-execution-core');

const CANARY = Object.freeze({
  schema: 'google_ads.canary.v1',
  customer_id: '7376153998',
  campaign_id: '23276824770',
  keyword: 'zz-parma-canary-20260907',
  add_mutation_type: 'ADD_CAMPAIGN_NEGATIVE_EXACT',
  remove_mutation_type: 'REMOVE_AGENT_CREATED_CAMPAIGN_NEGATIVE_EXACT',
  max_financial_exposure_eur: 0,
  spend_changes_allowed: false,
  max_mutations: 2,
});

const CANARY_MUTATION_TYPES = Object.freeze([
  CANARY.add_mutation_type,
  CANARY.remove_mutation_type,
]);

const ID = /^\d{1,20}$/;
const RESOURCE_NAME = new RegExp(`^customers/${CANARY.customer_id}/campaignCriteria/\\d+~\\d+$`);

const sha256 = value => crypto.createHash('sha256').update(stableStringify(value)).digest('hex');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function canaryAuditIntegrityKeyAvailable(env) {
  const value = env?.ADS_AUDIT_INTEGRITY_KEY;
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < 32) return false;
  return true;
}

function canaryAuditIntegrityKey(env) {
  if (!canaryAuditIntegrityKeyAvailable(env)) throw new Error('audit_integrity_key_unavailable');
  return crypto.createHash('sha256').update(`parma-google-ads-canary-audit-v1:${env.ADS_AUDIT_INTEGRITY_KEY}`).digest();
}

function resolveCanaryAuditPath(env = process.env, auditPath = null) {
  if (auditPath) return auditPath;
  if (env.ADS_AUDIT_PATH) return env.ADS_AUDIT_PATH;
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH;
  if (typeof mount === 'string' && mount.trim()) return path.join(mount, 'parma-ads-audit', 'google-ads-canary');
  return null;
}

function durableMountVerified(env, auditPath) {
  const expectedMounts = [
    auditPath,
    env.RAILWAY_VOLUME_MOUNT_PATH,
    '/data',
  ].filter(value => typeof value === 'string' && value.trim());
  if (!expectedMounts.length) return false;
  try {
    const mountinfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
    return expectedMounts.some(expected => mountinfo.split('\n').some(line => line.split(' ').includes(expected)));
  } catch {
    return false;
  }
}

function createCanaryAuditStore({
  env = process.env,
  now = Date.now,
  auditPath = null,
  requireDurableMount = true,
} = {}) {
  const key = canaryAuditIntegrityKey(env);
  const resolved = resolveCanaryAuditPath(env, auditPath);
  if (!resolved || !path.isAbsolute(resolved) || resolved === path.parse(resolved).root) {
    throw new Error('audit_path_unavailable');
  }

  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('audit_path_unavailable');
  }
  if (stat && !stat.isDirectory()) throw new Error('audit_path_unwritable');
  if (requireDurableMount && !durableMountVerified(env, resolved)) throw new Error('durable_audit_mount_unverified');

  return new ControlledAdsStore({ directory: resolved, integrityKey: key, now });
}

function assertCanaryTarget({ customer_id, campaign_id, keyword } = {}) {
  const blockers = [];
  if (customer_id !== CANARY.customer_id) blockers.push('canary_customer_mismatch');
  if (campaign_id !== CANARY.campaign_id) blockers.push('canary_campaign_mismatch');
  if (keyword !== CANARY.keyword) blockers.push('canary_keyword_mismatch');
  return { ok: blockers.length === 0, blockers };
}

function validateCanaryCustomer(customer) {
  const id = String(customer?.credentials?.customer_id || customer?.customerId || '');
  return ID.test(id) && id === CANARY.customer_id;
}

function validateExactNegativeKeyword(value) {
  return typeof value === 'string' && value === CANARY.keyword && value === value.trim() && value.length > 0 && value.length <= 80;
}

class CanaryAuthorization {
  constructor({
    authorization_id,
    subject = 'parma-ads-agent-canary-runner',
    customer_id = CANARY.customer_id,
    campaign_id = CANARY.campaign_id,
    keyword = CANARY.keyword,
    expires_at,
    issued_at,
    used_steps = [],
    used_at = null,
  } = {}) {
    if (!authorization_id || !/^[A-Za-z0-9:_-]{1,200}$/.test(authorization_id)) throw new Error('invalid_authorization_id');
    if (!ID.test(customer_id) || !ID.test(campaign_id) ||
        typeof keyword !== 'string' || keyword !== keyword.trim() || !keyword || keyword.length > 80 ||
        /[\\'\r\n]/.test(keyword)) {
      throw new Error('invalid_authorization_scope');
    }
    if (typeof expires_at !== 'string' || !Number.isFinite(Date.parse(expires_at))) throw new Error('authorization_expiry_invalid');
    if (typeof issued_at !== 'string' || !Number.isFinite(Date.parse(issued_at))) throw new Error('authorization_issue_time_invalid');
    if (Date.parse(expires_at) <= Date.parse(issued_at)) throw new Error('authorization_expiry_invalid');
    if (!Array.isArray(used_steps) || used_steps.some(step => !CANARY_MUTATION_TYPES.includes(step))) throw new Error('invalid_authorization_used_steps');
    this.authorization_id = authorization_id;
    this.subject = subject;
    this.customer_id = customer_id;
    this.campaign_id = campaign_id;
    this.keyword = keyword;
    this.mutation_types = [...CANARY_MUTATION_TYPES];
    this.expires_at = expires_at;
    this.issued_at = issued_at;
    this.used_steps = [...used_steps];
    this.used_at = used_at;
    this.max_mutations = CANARY.max_mutations;
    this.max_financial_exposure_eur = CANARY.max_financial_exposure_eur;
    this.spend_changes_allowed = CANARY.spend_changes_allowed;
    this.non_transferable = true;
    this.single_use_per_mutation_type = true;
  }

  canConsumeStep(mutation_type, { now = Date.now, customer_id = CANARY.customer_id, campaign_id = CANARY.campaign_id, keyword = CANARY.keyword } = {}) {
    const target = assertCanaryTarget({ customer_id, campaign_id, keyword });
    if (!target.ok) return { allowed: false, reason: target.blockers[0], authorization: this };
    const authorizationTarget = assertCanaryTarget({
      customer_id: this.customer_id,
      campaign_id: this.campaign_id,
      keyword: this.keyword,
    });
    if (!authorizationTarget.ok) return { allowed: false, reason: authorizationTarget.blockers[0], authorization: this };
    if (!CANARY_MUTATION_TYPES.includes(mutation_type)) return { allowed: false, reason: 'non_allowlisted_canary_mutation', authorization: this };
    if (Date.parse(this.expires_at) <= now()) return { allowed: false, reason: 'authorization_expired', authorization: this };
    if (this.max_financial_exposure_eur !== 0) return { allowed: false, reason: 'financial_exposure_not_zero', authorization: this };
    if (this.spend_changes_allowed !== false) return { allowed: false, reason: 'spend_changes_not_denied', authorization: this };
    if (this.used_steps.includes(mutation_type)) return { allowed: false, reason: 'authorization_already_used_for_mutation_type', authorization: this };
    if (this.used_steps.length >= this.max_mutations) return { allowed: false, reason: 'authorization_fully_consumed', authorization: this };
    if (mutation_type === CANARY.remove_mutation_type && !this.used_steps.includes(CANARY.add_mutation_type)) {
      return { allowed: false, reason: 'add_must_precede_rollback', authorization: this };
    }
    return { allowed: true, reason: 'scoped_single_use_authorized', authorization: this };
  }

  consumeStep(mutation_type, context = {}) {
    const check = this.canConsumeStep(mutation_type, context);
    if (!check.allowed) throw new Error(check.reason);
    return new CanaryAuthorization({
      authorization_id: this.authorization_id,
      subject: this.subject,
      customer_id: this.customer_id,
      campaign_id: this.campaign_id,
      keyword: this.keyword,
      expires_at: this.expires_at,
      issued_at: this.issued_at,
      used_steps: [...this.used_steps, mutation_type],
      used_at: new Date(context.now ? context.now() : Date.now()).toISOString(),
    });
  }
}

function issueCanaryAuthorization({
  now = Date.now,
  expiresAt,
  subject = 'parma-ads-agent-canary-runner',
  authorizationId = null,
  campaignId = CANARY.campaign_id,
  keyword = CANARY.keyword,
} = {}) {
  const clock = now();
  const expires = typeof expiresAt === 'number' ? new Date(expiresAt).toISOString() : expiresAt;
  if (!expires || Date.parse(expires) <= clock) throw new Error('authorization_expiry_invalid');
  const issued = new Date(clock).toISOString();
  const id = authorizationId || `canary-${sha256({ subject, customer_id: CANARY.customer_id, campaign_id: campaignId, keyword, issued, expires }).slice(0, 24)}`;
  return new CanaryAuthorization({
    authorization_id: id,
    subject,
    customer_id: CANARY.customer_id,
    campaign_id: campaignId,
    keyword,
    expires_at: expires,
    issued_at: issued,
  });
}

function createCanaryReadAdapter(customer) {
  if (!validateCanaryCustomer(customer) || typeof customer.query !== 'function') throw new Error('invalid_canary_google_client');
  const query = `
    SELECT
      campaign_criterion.resource_name,
      campaign_criterion.keyword.text,
      campaign_criterion.keyword.match_type
    FROM campaign_criterion
    WHERE campaign.id = ${CANARY.campaign_id}
      AND campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.negative = TRUE
      AND campaign_criterion.status != 'REMOVED'
    LIMIT 10000
  `;

  async function readExactNegative({ campaign_id = CANARY.campaign_id, keyword = CANARY.keyword } = {}) {
    const target = assertCanaryTarget({ customer_id: CANARY.customer_id, campaign_id, keyword });
    if (!target.ok) throw new Error(target.blockers[0]);
    const rows = await customer.query(query);
    return (rows || [])
      .map(row => ({
        resource_name: String(row?.campaign_criterion?.resource_name || ''),
        keyword: String(row?.campaign_criterion?.keyword?.text || ''),
        match_type: String(row?.campaign_criterion?.keyword?.match_type || ''),
      }))
      .filter(row => row.keyword === CANARY.keyword && row.match_type === 'EXACT')
      .sort((a, b) => a.resource_name.localeCompare(b.resource_name));
  }

  async function readState({ campaign_id = CANARY.campaign_id, keyword = CANARY.keyword } = {}) {
    const rows = await readExactNegative({ campaign_id, keyword });
    return {
      campaign_id,
      canary_exact_negative_present: rows.length > 0,
    };
  }

  return {
    customerId: CANARY.customer_id,
    readExactNegative,
    readState,
  };
}

function buildCanaryMutationOperation(input = {}) {
  if (!input || typeof input !== 'object') throw new Error('invalid_canary_mutation');
  const { mutation_type, campaign_id = CANARY.campaign_id, keyword = CANARY.keyword, match_type = 'EXACT', resource_name = null, ownership = null } = input;
  if (!CANARY_MUTATION_TYPES.includes(mutation_type)) throw new Error('non_allowlisted_canary_mutation');
  const target = assertCanaryTarget({ customer_id: CANARY.customer_id, campaign_id, keyword });
  if (!target.ok) throw new Error(target.blockers[0]);

  if (mutation_type === CANARY.add_mutation_type) {
    if (match_type !== 'EXACT') throw new Error('non_exact_negative_blocked');
    if (!validateExactNegativeKeyword(keyword)) throw new Error('invalid_exact_negative_keyword');
    return {
      type: 'create',
      campaign_id,
      text: keyword,
      match_type: 'EXACT',
    };
  }

  if (mutation_type === CANARY.remove_mutation_type) {
    if (!resource_name || !RESOURCE_NAME.test(String(resource_name))) throw new Error('invalid_canary_resource_name');
    if (!ownership || typeof ownership !== 'object') throw new Error('agent_ownership_required_for_removal');
    if (ownership.agent_created !== true ||
        ownership.customer_id !== CANARY.customer_id ||
        ownership.campaign_id !== CANARY.campaign_id ||
        ownership.keyword !== CANARY.keyword ||
        ownership.resource_name !== resource_name ||
        typeof ownership.change_id !== 'string' || !ownership.change_id) {
      throw new Error('agent_ownership_required_for_removal');
    }
    return {
      type: 'remove',
      resource_name,
    };
  }

  throw new Error('invalid_canary_mutation');
}

function createCanaryMutationAdapter(customer, { http = null } = {}) {
  const negativeAdapter = createNegativeRestAdapter(customer, { http: http || undefined });
  async function mutate(input = {}, options = {}) {
    if (typeof options.validate_only !== 'boolean') throw new Error('validate_only_required');
    const operation = buildCanaryMutationOperation(input);
    return negativeAdapter.mutate(operation, { validate_only: options.validate_only });
  }
  return {
    customerId: CANARY.customer_id,
    mutate,
  };
}

function canaryCriterionState(present) {
  return {
    campaign_id: CANARY.campaign_id,
    canary_exact_negative_present: present === true,
  };
}

function buildCanaryMutationRequest({
  phase,
  changeId = null,
  resourceName = null,
  expiresAt,
  now = Date.now,
} = {}) {
  const clock = now();
  if (phase !== 'ADD' && phase !== 'REMOVE') throw new Error('invalid_canary_phase');
  if (!expiresAt || Date.parse(expiresAt) <= clock) throw new Error('canary_mutation_expiry_invalid');
  const isAdd = phase === 'ADD';
  if (!isAdd && (!resourceName || !RESOURCE_NAME.test(String(resourceName)))) throw new Error('canary_rollback_resource_required');

  return {
    change_id: changeId || `canary-${phase.toLowerCase()}-${clock}`,
    objective_id: 'production-google-ads-canary-20260907',
    campaign_id: CANARY.campaign_id,
    mutation_type: isAdd ? 'add_exact_negative_keyword' : 'remove_agent_created_negative_keyword',
    object_identifiers: isAdd
      ? [`customers/${CANARY.customer_id}/campaigns/${CANARY.campaign_id}`]
      : [resourceName],
    before_state: canaryCriterionState(!isAdd),
    proposed_after_state: canaryCriterionState(isAdd),
    reason: isAdd
      ? 'Production controlled write/rollback canary: add one synthetic exact negative keyword.'
      : 'Production controlled write/rollback canary: remove the agent-created synthetic exact negative keyword.',
    evidence: [{ type: 'canary_authorization', reference: CANARY.keyword, captured_at: new Date(clock).toISOString() }],
    confidence: 1,
    risk_class: 'LOW',
    approval_class: POLICY_CLASSES.A_AUTONOMOUS_LOW_RISK,
    max_cost_eur: 0,
    expires_at: expiresAt,
  };
}

function canaryKillSwitch(env = process.env) {
  const killSwitch = new AdsKillSwitch();
  if (env.GOOGLE_ADS_WRITE_KILL_SWITCH !== 'false') {
    killSwitch.stopAdsAutonomy({ reason: 'google_ads_write_kill_switch_not_explicitly_false' });
  }
  if (env.GOOGLE_ADS_CANARY_KILL_SWITCH !== 'false') {
    killSwitch.disableCampaign(CANARY.campaign_id);
  }
  return killSwitch;
}

function canaryKillSwitchPermits(env = process.env) {
  return env.GOOGLE_ADS_WRITE_KILL_SWITCH === 'false' && env.GOOGLE_ADS_CANARY_KILL_SWITCH === 'false';
}

module.exports = {
  CANARY,
  CANARY_MUTATION_TYPES,
  canaryAuditIntegrityKeyAvailable,
  canaryAuditIntegrityKey,
  resolveCanaryAuditPath,
  durableMountVerified,
  createCanaryAuditStore,
  assertCanaryTarget,
  validateCanaryCustomer,
  validateExactNegativeKeyword,
  CanaryAuthorization,
  issueCanaryAuthorization,
  createCanaryReadAdapter,
  buildCanaryMutationOperation,
  createCanaryMutationAdapter,
  canaryCriterionState,
  buildCanaryMutationRequest,
  canaryKillSwitch,
  canaryKillSwitchPermits,
};
