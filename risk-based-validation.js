'use strict';

const RISK = Object.freeze({ LOW:'low', MEDIUM:'medium', HIGH:'high', CRITICAL:'critical' });
const HEAVY_AUDIT_TRIGGERS = new Set(['dependency_change','auth_change','secret_handling','external_write_path','spend_path','deployment_control','release_candidate']);

function classifyValidationRisk(change={}) {
  if (change.activation === true || change.spend_change === true || change.campaign_write === true) return RISK.CRITICAL;
  if (change.external_write === true || change.auth_change === true || change.secret_handling === true || change.deployment_control === true) return RISK.HIGH;
  if (change.autonomy_logic === true || change.runtime_route === true || change.persistence === true) return RISK.MEDIUM;
  return RISK.LOW;
}

function validationPlan(change={}) {
  const risk=classifyValidationRisk(change);
  const triggers=Array.isArray(change.triggers)?change.triggers:[];
  const heavyAudit=triggers.some(x=>HEAVY_AUDIT_TRIGGERS.has(x)) || risk===RISK.CRITICAL;
  return {
    risk,
    targeted_tests:true,
    syntax_check:true,
    adversarial_fail_closed:risk!==RISK.LOW,
    full_regression:risk===RISK.MEDIUM||risk===RISK.HIGH||risk===RISK.CRITICAL,
    live_read_only_validation:risk===RISK.MEDIUM||risk===RISK.HIGH||risk===RISK.CRITICAL,
    post_write_readback:risk===RISK.HIGH||risk===RISK.CRITICAL,
    heavy_repository_audit:heavyAudit,
    human_approval_required:risk===RISK.CRITICAL||change.external_write===true,
  };
}
module.exports={RISK,HEAVY_AUDIT_TRIGGERS,classifyValidationRisk,validationPlan};
