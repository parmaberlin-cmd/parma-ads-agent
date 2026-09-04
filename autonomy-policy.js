const ACTION_CLASSES = Object.freeze({
  READ_ONLY: 'read_only',
  INTERNAL_REVERSIBLE: 'internal_reversible',
  AD_PLATFORM_WRITE: 'ad_platform_write',
  GOOGLE_CONTROLLED_WRITE: 'google_controlled_write',
  SPEND_CHANGE: 'spend_change',
  CAMPAIGN_CREATION: 'campaign_creation',
  ACTIVATION: 'activation',
});

const SAFE_AUTONOMOUS_ACTIONS = new Set([
  'collect_metrics',
  'refresh_shadow_snapshot',
  'run_diagnostics',
  'generate_report',
  'record_internal_journal',
  'score_recommendation',
  'simulate_budget',
]);

const GOOGLE_CONTROLLED_ACTIONS = new Set([
  'update_ad',
  'update_asset',
  'update_keyword',
  'add_negative_keyword',
  'update_match_type',
  'update_schedule',
  'update_location',
  'reallocate_budget',
]);

function classifyAction(action = {}) {
  const name = String(action.name || 'unknown');
  if (['change_budget', 'increase_budget', 'decrease_budget'].includes(name)) return ACTION_CLASSES.SPEND_CHANGE;
  if (['create_campaign', 'create_adset', 'create_ad', 'create_creative'].includes(name)) return ACTION_CLASSES.CAMPAIGN_CREATION;
  if (['activate_campaign', 'activate_adset', 'activate_ad', 'resume_delivery'].includes(name)) return ACTION_CLASSES.ACTIVATION;
  if (GOOGLE_CONTROLLED_ACTIONS.has(name) && String(action.platform || '').toLowerCase() === 'google_ads') return ACTION_CLASSES.GOOGLE_CONTROLLED_WRITE;
  if (SAFE_AUTONOMOUS_ACTIONS.has(name)) return name === 'record_internal_journal' ? ACTION_CLASSES.INTERNAL_REVERSIBLE : ACTION_CLASSES.READ_ONLY;
  if (action.external_write === true) return ACTION_CLASSES.AD_PLATFORM_WRITE;
  return ACTION_CLASSES.READ_ONLY;
}

function googleControlledWriteAllowed(action = {}, context = {}) {
  const sameAccount = context.account_verified === true;
  const rollback = context.rollback_defined === true;
  const audit = context.audit_enabled === true;
  const totalSpendIncrease = Number(context.total_daily_budget_delta || 0) > 0;
  const conversionMeaningChange = context.changes_conversion_meaning === true || context.changes_primary_conversion === true;
  const newCampaignSpend = context.new_campaign_spend === true;
  const credentialChange = context.credential_or_scope_change === true;
  const maxCampaignIncreasePct = Number(context.single_campaign_budget_increase_pct || 0);
  const withinReallocationCage = maxCampaignIncreasePct <= 20;

  if (!sameAccount) return { allowed:false, reason:'account_not_verified' };
  if (!rollback) return { allowed:false, reason:'rollback_not_defined' };
  if (!audit) return { allowed:false, reason:'audit_not_enabled' };
  if (totalSpendIncrease) return { allowed:false, reason:'total_spend_increase_requires_owner' };
  if (!withinReallocationCage) return { allowed:false, reason:'campaign_reallocation_above_20_percent' };
  if (newCampaignSpend) return { allowed:false, reason:'new_campaign_spend_requires_owner' };
  if (conversionMeaningChange) return { allowed:false, reason:'conversion_semantics_change_requires_owner' };
  if (credentialChange) return { allowed:false, reason:'credential_or_scope_change_requires_owner' };
  return { allowed:true, reason:'authorized_google_controlled_write' };
}

function authorizeAutonomy(action = {}, context = {}) {
  const actionClass = classifyAction(action);
  const promotionReady = context.autonomy_class === 'supervised_reversible_candidate';
  const killSwitch = context.kill_switch === true;
  const humanApproved = context.human_approved === true;

  if (killSwitch) return { allowed: false, reason: 'kill_switch_active', action_class: actionClass };

  if ([ACTION_CLASSES.SPEND_CHANGE, ACTION_CLASSES.CAMPAIGN_CREATION, ACTION_CLASSES.ACTIVATION].includes(actionClass)) {
    return { allowed: false, reason: 'human_approval_mandatory', action_class: actionClass, human_approval_required: true };
  }

  if (actionClass === ACTION_CLASSES.GOOGLE_CONTROLLED_WRITE) {
    const decision = googleControlledWriteAllowed(action, context);
    return { ...decision, action_class: actionClass, human_approval_required: !decision.allowed };
  }

  if (actionClass === ACTION_CLASSES.AD_PLATFORM_WRITE) {
    return {
      allowed: promotionReady && humanApproved,
      reason: promotionReady && humanApproved ? 'supervised_external_write_candidate' : 'external_write_not_authorized',
      action_class: actionClass,
      human_approval_required: true,
    };
  }

  if (actionClass === ACTION_CLASSES.INTERNAL_REVERSIBLE) {
    return { allowed: promotionReady, reason: promotionReady ? 'supervised_internal_action_allowed' : 'promotion_not_ready', action_class: actionClass };
  }

  return { allowed: SAFE_AUTONOMOUS_ACTIONS.has(String(action.name || '')), reason: SAFE_AUTONOMOUS_ACTIONS.has(String(action.name || '')) ? 'safe_read_only_action' : 'unknown_action_not_allowlisted', action_class: actionClass };
}

function autonomyPolicySummary() {
  return {
    autonomous_now: [...SAFE_AUTONOMOUS_ACTIONS].filter((name) => name !== 'record_internal_journal'),
    delegated_google_controlled: [...GOOGLE_CONTROLLED_ACTIONS],
    google_controlled_requirements: ['account_verified','rollback_defined','audit_enabled','no_total_spend_increase','max_20_percent_single_campaign_reallocation','no_new_campaign_spend','no_conversion_semantics_change','no_credential_or_scope_change'],
    supervised_after_promotion: ['record_internal_journal'],
    always_human_approval: ['change_budget', 'increase_budget', 'decrease_budget', 'create_campaign', 'create_adset', 'create_ad', 'create_creative', 'activate_campaign', 'activate_adset', 'activate_ad', 'resume_delivery'],
    default_external_writes_allowed: false,
    default_spend_allowed: false,
  };
}

module.exports = { ACTION_CLASSES, SAFE_AUTONOMOUS_ACTIONS, GOOGLE_CONTROLLED_ACTIONS, classifyAction, googleControlledWriteAllowed, authorizeAutonomy, autonomyPolicySummary };
