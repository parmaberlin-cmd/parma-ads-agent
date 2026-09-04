'use strict';
// Preparation only. This module has no network, credentials or mutation adapter.
const { z } = require('zod');
const { createHash } = require('node:crypto');
const id = z.string().regex(/^\d{1,20}$/);
const money = z.number().int().nonnegative().safe();
const time = z.string().datetime();
const policySchema = z.object({
  campaign_ids: z.array(id).min(1),
  allowed_actions: z.array(z.enum(['set_daily_budget', 'pause', 'resume', 'add_negative_keyword'])),
  expires_at: time,
  max_account_daily_budget_micros: money,
  max_campaign_daily_budget_micros: money,
  max_budget_change_percent: z.number().min(0).max(100),
  max_snapshot_age_seconds: z.number().int().min(1).max(3600),
}).strict();
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_daily_budget'), campaign_id: id, amount_micros: money.positive() }).strict(),
  z.object({ type: z.literal('pause'), campaign_id: id }).strict(),
  z.object({ type: z.literal('resume'), campaign_id: id }).strict(),
  z.object({ type: z.literal('add_negative_keyword'), campaign_id: id,
    text: z.string().trim().min(1).max(80), match_type: z.enum(['EXACT', 'PHRASE']) }).strict(),
]);
const snapshotSchema = z.object({
  customer_id: id, currency: z.literal('EUR'), captured_at: time,
  account_inventory_complete: z.literal(true),
  campaigns: z.array(z.object({ campaign_id: id, budget_id: id,
    daily_budget_micros: money.positive(), status: z.enum(['ENABLED', 'PAUSED']),
    shared_budget: z.boolean(), conversion_integrity_trusted: z.boolean(),
  }).strict()).min(1),
}).strict();
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function prepareControlledProposal({ action, policy, snapshot, now = Date.now(), kill_switch = false } = {}) {
  const result = { mode: 'prepare_only', writes_allowed: false, spend_allowed: false,
    execution_allowed: false, policy_fit: false, requires_owner_approval: true, blockers: [] };
  if (kill_switch !== false) result.blockers.push('kill_switch_active');
  if (!Number.isSafeInteger(now)) result.blockers.push('invalid_clock');
  const a = actionSchema.safeParse(action), p = policySchema.safeParse(policy), s = snapshotSchema.safeParse(snapshot);
  if (!a.success) result.blockers.push('invalid_or_unsupported_action');
  if (!p.success) result.blockers.push('owner_limits_missing_or_invalid');
  if (!s.success) result.blockers.push('trusted_complete_snapshot_required');
  if (result.blockers.length) return result;
  action = a.data; policy = p.data; snapshot = s.data;
  const age = now - Date.parse(snapshot.captured_at);
  if (age < 0 || age >= policy.max_snapshot_age_seconds * 1000) result.blockers.push('snapshot_stale_or_future');
  if (Date.parse(policy.expires_at) <= now) result.blockers.push('owner_policy_expired');
  if (!policy.campaign_ids.includes(action.campaign_id)) result.blockers.push('campaign_not_authorized');
  if (!policy.allowed_actions.includes(action.type)) result.blockers.push('action_not_authorized');
  if (new Set(snapshot.campaigns.map(c => c.campaign_id)).size !== snapshot.campaigns.length) result.blockers.push('duplicate_campaign_inventory');
  const campaign = snapshot.campaigns.find(c => c.campaign_id === action.campaign_id);
  if (!campaign) result.blockers.push('campaign_not_found');
  if (result.blockers.length) return result;
  // Reject shared/reused budgets rather than underestimate their account impact.
  if (snapshot.campaigns.some(c => c.shared_budget) || new Set(snapshot.campaigns.map(c => c.budget_id)).size !== snapshot.campaigns.length)
    result.blockers.push('shared_budget_requires_separate_review');
  const currentTotal = snapshot.campaigns.reduce((sum, c) => sum + c.daily_budget_micros, 0);
  const nextBudget = action.type === 'set_daily_budget' ? action.amount_micros : campaign.daily_budget_micros;
  const proposedTotal = currentTotal - campaign.daily_budget_micros + nextBudget;
  if (!Number.isSafeInteger(currentTotal) || !Number.isSafeInteger(proposedTotal)) result.blockers.push('budget_arithmetic_overflow');
  if (action.type === 'set_daily_budget' || action.type === 'resume') {
    if (nextBudget > policy.max_campaign_daily_budget_micros) result.blockers.push('campaign_budget_limit_exceeded');
    if (proposedTotal > policy.max_account_daily_budget_micros) result.blockers.push('account_budget_limit_exceeded');
    if (action.type === 'resume' || nextBudget > campaign.daily_budget_micros) {
      if (!campaign.conversion_integrity_trusted) result.blockers.push('conversion_integrity_untrusted');
    }
  }
  if (action.type === 'set_daily_budget') {
    const changePercent = Math.abs(nextBudget - campaign.daily_budget_micros) / campaign.daily_budget_micros * 100;
    if (changePercent > policy.max_budget_change_percent) result.blockers.push('budget_change_limit_exceeded');
    if (nextBudget === campaign.daily_budget_micros) result.blockers.push('no_change');
  }
  if ((action.type === 'pause' && campaign.status === 'PAUSED') || (action.type === 'resume' && campaign.status === 'ENABLED')) result.blockers.push('no_change');
  result.policy_fit = result.blockers.length === 0;
  result.proposal = { customer_id: snapshot.customer_id, action, before: campaign,
    proposed_account_daily_budget_micros: proposedTotal,
    snapshot_digest: digest(snapshot), policy_digest: digest(policy),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(Math.min(Date.parse(policy.expires_at), Date.parse(snapshot.captured_at) + policy.max_snapshot_age_seconds * 1000)).toISOString(),
  };
  result.proposal_id = digest(result.proposal);
  return result;
}
module.exports = { prepareControlledProposal };
