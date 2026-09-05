const ACTION_CLASSES = Object.freeze({
  READ_ONLY: 'read_only',
  INTERNAL_REVERSIBLE: 'internal_reversible',
  CONTROLLED_INTERNAL: 'controlled_internal',
  CONTROLLED_DELEGATED: 'controlled_delegated',
  AD_PLATFORM_WRITE: 'ad_platform_write',
  SPEND_CHANGE: 'spend_change',
  CAMPAIGN_CREATION: 'campaign_creation',
  ACTIVATION: 'activation',
});

const SAFE_AUTONOMOUS_ACTIONS = new Set([
  'collect_metrics','refresh_shadow_snapshot','run_diagnostics','generate_report','record_internal_journal','score_recommendation','simulate_budget',
  'google_ads.read_campaign','google_ads.propose_changes','google_ads.execution_preflight','google_ads.cycle_plan',
  'instagram.audit_capability','instagram.publish_preflight',
]);
const CONTROLLED_GATEWAYS=new Set(['google_ads.execute_authorized']);
const CONTROLLED_INTERNAL=new Set(['runtime.register_recurring']);

function classifyAction(action = {}) {
  const name = String(action.name || 'unknown');
  if(CONTROLLED_GATEWAYS.has(name))return ACTION_CLASSES.CONTROLLED_DELEGATED;
  if(CONTROLLED_INTERNAL.has(name))return ACTION_CLASSES.CONTROLLED_INTERNAL;
  if (['change_budget', 'increase_budget', 'decrease_budget'].includes(name)) return ACTION_CLASSES.SPEND_CHANGE;
  if (['create_campaign', 'create_adset', 'create_ad', 'create_creative'].includes(name)) return ACTION_CLASSES.CAMPAIGN_CREATION;
  if (['activate_campaign', 'activate_adset', 'activate_ad', 'resume_delivery'].includes(name)) return ACTION_CLASSES.ACTIVATION;
  if (SAFE_AUTONOMOUS_ACTIONS.has(name)) return name === 'record_internal_journal' ? ACTION_CLASSES.INTERNAL_REVERSIBLE : ACTION_CLASSES.READ_ONLY;
  if (action.external_write === true) return ACTION_CLASSES.AD_PLATFORM_WRITE;
  return ACTION_CLASSES.READ_ONLY;
}

function authorizeAutonomy(action = {}, context = {}) {
  const actionClass = classifyAction(action);
  const promotionReady = context.autonomy_class === 'supervised_reversible_candidate';
  const killSwitch = context.kill_switch === true;
  const humanApproved = context.human_approved === true;
  if (killSwitch) return { allowed: false, reason: 'kill_switch_active', action_class: actionClass };
  if(actionClass===ACTION_CLASSES.CONTROLLED_DELEGATED)return {allowed:true,reason:'controlled_gateway_internal_standing_policy_required',action_class:actionClass,standing_delegation_required:true};
  if(actionClass===ACTION_CLASSES.CONTROLLED_INTERNAL)return {allowed:true,reason:'controlled_internal_noninvasive_policy',action_class:actionClass};
  if ([ACTION_CLASSES.SPEND_CHANGE, ACTION_CLASSES.CAMPAIGN_CREATION, ACTION_CLASSES.ACTIVATION].includes(actionClass)) return { allowed: false, reason: 'human_approval_mandatory', action_class: actionClass, human_approval_required: true };
  if (actionClass === ACTION_CLASSES.AD_PLATFORM_WRITE) return {allowed: promotionReady && humanApproved,reason: promotionReady && humanApproved ? 'supervised_external_write_candidate' : 'external_write_not_authorized',action_class: actionClass,human_approval_required: true};
  if (actionClass === ACTION_CLASSES.INTERNAL_REVERSIBLE) return { allowed: promotionReady, reason: promotionReady ? 'supervised_internal_action_allowed' : 'promotion_not_ready', action_class: actionClass };
  return { allowed: SAFE_AUTONOMOUS_ACTIONS.has(String(action.name || '')), reason: SAFE_AUTONOMOUS_ACTIONS.has(String(action.name || '')) ? 'safe_read_only_action' : 'unknown_action_not_allowlisted', action_class: actionClass };
}

function autonomyPolicySummary() {
  return {autonomous_now:[...SAFE_AUTONOMOUS_ACTIONS].filter(name=>name!=='record_internal_journal'),controlled_internal:[...CONTROLLED_INTERNAL],controlled_gateways:[...CONTROLLED_GATEWAYS],supervised_after_promotion:['record_internal_journal'],always_human_approval:['change_budget','increase_budget','decrease_budget','create_campaign','create_adset','create_ad','create_creative','activate_campaign','activate_adset','activate_ad','resume_delivery'],default_external_writes_allowed:false,default_spend_allowed:false};
}
module.exports = { ACTION_CLASSES, SAFE_AUTONOMOUS_ACTIONS, CONTROLLED_INTERNAL, CONTROLLED_GATEWAYS, classifyAction, authorizeAutonomy, autonomyPolicySummary };
