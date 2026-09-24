'use strict';

const { randomBytes } = require('node:crypto');
const { buildEnvelope } = require('./scripts/submit-commercial-job');
const { UnattendedJobStore, jobStoreDirectory, jobIntegrityKey, signEnvelope } = require('./google-ads-unattended-job-store');

const ALLOWED = new Set(['negative_add','negative_remove','keyword_create','keyword_update','keyword_remove','schedule_create','schedule_remove','rsa_create','rsa_update','rsa_remove','ad_group_update','campaign_update']);

function createCommercialHandoffTool({ env = process.env, authorize, now = Date.now } = {}) {
  if (typeof authorize !== 'function') throw new TypeError('authorize_required');
  return async function submit(args = {}, authContext) {
    try {
      if (await authorize(authContext, { scope: 'parma.write', tool: 'parma_submit_commercial_plan' }) !== true) throw new Error('unauthorized');
      if (args.confirm_authorized !== true) throw new Error('explicit_authorization_required');
      const plan = args.plan;
      if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('plan_required');
      if (plan.spend_allowed !== false) throw new Error('spend_must_remain_false');
      const actions = Array.isArray(plan.actions) ? plan.actions : [];
      if (!actions.length || actions.length > 50) throw new Error('invalid_action_count');
      const types = [...new Set(actions.map(x => x?.action?.type))];
      if (types.some(type => !ALLOWED.has(type))) throw new Error('action_not_allowed');
      if (actions.some(x => x?.action?.status === 'ENABLED')) throw new Error('activation_not_allowed_via_mcp');
      const timestamp = now();
      const handoff = {
        job_id: args.job_id || `chatgpt-${timestamp}-${randomBytes(6).toString('hex')}`,
        plan,
        depends_on: Array.isArray(args.depends_on) ? args.depends_on : [],
        authorization: {
          grant_id: `chatgpt-${timestamp}`,
          nonce: randomBytes(24).toString('base64url'),
          expires_at: new Date(timestamp + 60 * 60 * 1000).toISOString(),
          customer_id: String(plan.customer_id || ''),
          allowed_action_types: types,
          activation_allowed: false,
          spend_allowed: false,
          max_actions: actions.length,
        },
      };
      const built = buildEnvelope(handoff, { now: timestamp });
      if (!built.envelope) throw new Error(built.blockers?.[0] || 'handoff_invalid');
      const key = jobIntegrityKey(env);
      const envelope = { ...built.envelope, authorization: { ...built.envelope.authorization, signature: signEnvelope(built.envelope, key) } };
      const directory = jobStoreDirectory(env);
      if (!directory) throw new Error('job_store_directory_unavailable');
      const store = new UnattendedJobStore({ directory, integrityKey: key, now });
      store.submit(envelope);
      return {
        success: true, status: 'QUEUED', job_id: envelope.job_id, plan_id: plan.plan_id,
        plan_digest: envelope.plan_digest, actions: actions.length, spend_allowed: false,
        activation_allowed: false, provider_write: false, writes_executed: 0,
        execution: 'service_side_worker',
      };
    } catch (error) {
      return { success: false, status: 'BLOCKED', blocker: String(error?.message || error).split('\n')[0], provider_write: false, writes_executed: 0, spend_allowed: false };
    }
  };
}

module.exports = { createCommercialHandoffTool, ALLOWED };
