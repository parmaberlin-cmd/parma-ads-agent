#!/usr/bin/env node
'use strict';

// Handoff CLI: validates, signs and durably queues one commercial job.
//
//   node scripts/submit-commercial-job.js <handoff.json> [--dry-run]
//
// This process NEVER executes the plan and never calls the Google Ads API: it
// only writes the signed job onto the persistent volume. Execution happens later
// inside the always-on service worker, so disconnecting this session (ssh,
// terminal, Codex) cannot stop or duplicate the job.
const fs = require('node:fs');
const path = require('node:path');
const {
  UnattendedJobStore,
  jobStoreDirectory,
  jobIntegrityKey,
  signEnvelope,
  canonicalEnvelope,
} = require('../google-ads-unattended-job-store');
const { planDigest } = require('../google-ads-commercial-runner');

const ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function fail(reason) {
  console.log(JSON.stringify({ status: 'BLOCKED', blockers: [reason], provider_write: false, writes_executed: 0 }));
  process.exitCode = 1;
}

function buildEnvelope(handoff, { now = Date.now() } = {}) {
  const plan = handoff.plan;
  const grant = handoff.authorization || {};
  const blockers = [];
  if (!plan || typeof plan !== 'object') blockers.push('plan_required');
  if (!ID_PATTERN.test(String(handoff.job_id || ''))) blockers.push('job_id_invalid');
  if (!ID_PATTERN.test(String(grant.grant_id || ''))) blockers.push('grant_id_invalid');
  if (!ID_PATTERN.test(String(grant.nonce || ''))) blockers.push('grant_nonce_invalid');
  const expiresAt = Date.parse(grant.expires_at);
  if (!Number.isFinite(expiresAt)) blockers.push('grant_expiry_invalid');
  else if (expiresAt <= now) blockers.push('grant_expiry_in_past');
  if (grant.spend_allowed !== false) blockers.push('grant_spend_must_be_false');
  if (typeof grant.activation_allowed !== 'boolean') blockers.push('grant_activation_flag_invalid');
  if (!Array.isArray(grant.allowed_action_types) || grant.allowed_action_types.length === 0) blockers.push('grant_action_types_required');
  if (!Number.isInteger(grant.max_actions) || grant.max_actions < 1 || grant.max_actions > 50) blockers.push('grant_max_actions_invalid');
  if (blockers.length) return { blockers };

  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  if (actions.length === 0) blockers.push('plan_actions_required');
  if (actions.length > grant.max_actions) blockers.push('plan_action_count_exceeds_grant');
  const allowed = new Set(grant.allowed_action_types);
  if (actions.some(action => !allowed.has(action?.action?.type))) blockers.push('plan_action_not_authorized');
  if (plan.spend_allowed !== false) blockers.push('plan_spend_must_remain_false');
  if (String(plan.customer_id || '') !== String(grant.customer_id || '')) blockers.push('plan_customer_mismatch');
  if (blockers.length) return { blockers };

  const envelope = {
    schema: 'google_ads.unattended_job.v1',
    job_id: handoff.job_id,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(Math.min(expiresAt, now + 24 * 60 * 60 * 1000)).toISOString(),
    depends_on: Array.isArray(handoff.depends_on) ? handoff.depends_on : [],
    plan,
    plan_digest: planDigest(plan),
    authorization: {
      grant_id: grant.grant_id,
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
      customer_id: String(grant.customer_id),
      allowed_action_types: [...grant.allowed_action_types],
      activation_allowed: grant.activation_allowed === true,
      spend_allowed: false,
      max_actions: grant.max_actions,
      nonce: grant.nonce,
      signature: '0'.repeat(64),
    },
  };
  return { envelope };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const input = args.find(argument => !argument.startsWith('--'));
  if (!input) return fail('handoff_file_required');
  const env = process.env;

  let handoff;
  try {
    handoff = JSON.parse(fs.readFileSync(input, 'utf8'));
  } catch {
    return fail('handoff_unreadable');
  }

  const built = buildEnvelope(handoff, { now: Date.now() });
  if (!built.envelope) return fail(built.blockers[0] || 'handoff_invalid');
  const key = jobIntegrityKey(env);
  const signature = signEnvelope(built.envelope, key);
  const envelope = { ...built.envelope, authorization: { ...built.envelope.authorization, signature } };

  if (dryRun) {
    console.log(JSON.stringify({
      status: 'VALIDATED', dry_run: true, job_id: envelope.job_id, plan_id: envelope.plan.plan_id,
      plan_digest: envelope.plan_digest, actions: envelope.plan.actions.length, expires_at: envelope.authorization.expires_at,
      depends_on: envelope.depends_on, signature, canonical_preview: canonicalEnvelope(envelope).slice(0, 160),
      provider_write: false, writes_executed: 0,
    }));
    return;
  }

  const directory = jobStoreDirectory(env);
  if (!directory) return fail('job_store_directory_unavailable');
  const store = new UnattendedJobStore({ directory, integrityKey: key });
  try {
    store.submit(envelope);
  } catch (error) {
    return fail(String(error?.message || error).split('\n')[0]);
  }
  console.log(JSON.stringify({
    status: 'QUEUED', job_id: envelope.job_id, plan_id: envelope.plan.plan_id, plan_digest: envelope.plan_digest,
    actions: envelope.plan.actions.length, depends_on: envelope.depends_on, expires_at: envelope.authorization.expires_at,
    job_directory: path.join(directory, 'incoming'), execution: 'service_side_worker', provider_write: false, writes_executed: 0,
  }));
}

if (require.main === module) main();

module.exports = { buildEnvelope };
