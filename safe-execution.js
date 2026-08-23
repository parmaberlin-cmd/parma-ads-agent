const crypto = require("crypto");

const AUTONOMY_LEVELS = Object.freeze({ READ: "read", RECOMMEND: "recommend", SAFE_WRITE: "safe_write", SPEND_WRITE: "spend_write" });

function stableKey(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0,24); }

function validateMetaDraftPlan(plan = {}) {
  const errors = [];
  const warnings = [];
  if (plan.status !== "PAUSED") errors.push("draft_status_must_be_paused");
  if (!/^https:\/\//.test(String(plan.destination_url || ""))) errors.push("https_destination_required");
  if (!plan.creative_verified) errors.push("creative_must_be_verified");
  if (!plan.instagram_account_verified) errors.push("instagram_account_must_be_verified");
  if (!Number.isFinite(Number(plan.daily_budget_eur)) || Number(plan.daily_budget_eur) < 3 || Number(plan.daily_budget_eur) > 20) errors.push("daily_budget_outside_guardrail");
  if (!Number.isInteger(Number(plan.duration_days)) || Number(plan.duration_days) < 1 || Number(plan.duration_days) > 30) errors.push("duration_outside_guardrail");
  if (Array.isArray(plan.placements) && plan.placements.some((p) => !String(p).toLowerCase().includes("instagram"))) warnings.push("non_instagram_placement_present");
  return { ok: errors.length === 0, errors, warnings, plan_key: stableKey(plan) };
}

function authorizeExecution({ level, preflight, humanApproval = false, killSwitch = false }) {
  if (killSwitch) return { allowed:false, reason:"kill_switch_enabled" };
  if (!preflight?.ok) return { allowed:false, reason:"preflight_failed" };
  if (level === AUTONOMY_LEVELS.READ || level === AUTONOMY_LEVELS.RECOMMEND) return { allowed:false, reason:"write_not_allowed_at_level" };
  if (level === AUTONOMY_LEVELS.SAFE_WRITE) return { allowed:true, reason:"safe_write_allowed" };
  if (level === AUTONOMY_LEVELS.SPEND_WRITE && humanApproval === true) return { allowed:true, reason:"human_approved_spend_write" };
  return { allowed:false, reason:"human_approval_required_for_spend" };
}

function createExecutionJournal() {
  const entries = [];
  return {
    record(entry) { entries.push({ at:new Date().toISOString(), ...entry }); return entries.at(-1); },
    snapshot() { return entries.map((entry) => ({ ...entry })); },
  };
}

function classifyPartialCreation(created = {}) {
  const stages = ["campaign", "adset", "creative", "ad"];
  const present = stages.filter((stage) => Boolean(created[stage]));
  return { partial: present.length > 0 && present.length < stages.length, complete: present.length === stages.length, created_stages: present, next_stage: stages.find((stage) => !created[stage]) || null };
}

function buildRollbackPlan(created = {}) {
  return ["ad", "creative", "adset", "campaign"].filter((stage) => created[stage]).map((stage) => ({ stage, action:"pause_or_remove_if_safe", object_ref:created[stage] }));
}

module.exports = { AUTONOMY_LEVELS, validateMetaDraftPlan, authorizeExecution, createExecutionJournal, classifyPartialCreation, buildRollbackPlan, stableKey };
