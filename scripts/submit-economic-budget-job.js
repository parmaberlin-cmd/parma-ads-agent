#!/usr/bin/env node
'use strict';

// Handoff CLI for one economic budget job (spend).
//
//   node scripts/submit-economic-budget-job.js <handoff.json> [--dry-run]
//
// The handoff file carries the plan plus job_id/nonce/execute_at/expires_at.
// This process only signs and durably queues the job: it never calls Google Ads
// and never executes anything. The worker executes it when execute_at is due.
const fs = require('node:fs');
const { buildEnvelope, EconomicJobStore, planDigest, integrityKey } = require('../google-ads-economic-budget-job');

function fail(reason, extra = {}) {
  console.log(JSON.stringify({ status: 'BLOCKED', blockers: [reason], provider_write: false, writes_executed: 0, ...extra }));
  process.exitCode = 1;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const input = args.find(argument => !argument.startsWith('--'));
  if (!input) return fail('handoff_file_required');

  let handoff;
  try { handoff = JSON.parse(fs.readFileSync(input, 'utf8')); } catch { return fail('handoff_unreadable'); }

  let key;
  try { key = integrityKey(process.env); } catch (error) { return fail('economic_job_integrity_key_unavailable'); }

  const built = buildEnvelope({
    jobId: handoff.job_id,
    plan: handoff.plan,
    nonce: handoff.nonce,
    executeAt: handoff.execute_at,
    expiresAt: handoff.expires_at,
    key,
  });
  if (!built.envelope) return fail(built.blockers[0] || 'handoff_invalid', { blockers: built.blockers });
  const envelope = built.envelope;

  const summary = {
    job_id: envelope.job_id,
    plan_id: envelope.plan.plan_id,
    plan_digest: planDigest(envelope.plan),
    campaign_id: envelope.plan.campaign_id,
    budget_resource_name: envelope.plan.budget_resource_name,
    before_budget_micros: envelope.plan.before_budget_micros,
    target_budget_micros: envelope.plan.target_budget_micros,
    max_increment_micros: envelope.plan.max_increment_micros,
    max_budget_micros: envelope.plan.max_budget_micros,
    spend_allowed: envelope.plan.spend_allowed,
    execute_at: envelope.execute_at,
    expires_at: envelope.expires_at,
  };

  if (dryRun) {
    console.log(JSON.stringify({ status: 'VALIDATED', dry_run: true, ...summary, provider_write: false, writes_executed: 0 }));
    return;
  }

  let store;
  try { store = EconomicJobStore.fromEnv(process.env); } catch (error) { return fail(String((error && error.message) || error).split('\n')[0]); }
  try { store.submit(envelope); } catch (error) { return fail(String((error && error.message) || error).split('\n')[0]); }

  console.log(JSON.stringify({ status: 'QUEUED', ...summary, execution: 'service_side_worker', provider_write: false, writes_executed: 0 }));
}

if (require.main === module) main();

module.exports = { main };
