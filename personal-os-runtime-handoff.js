'use strict';

const crypto = require('node:crypto');
const { PersonalOsHandoffOutbox } = require('./personal-os-handoff-outbox');

const TERMINAL_STATUSES = new Set(['DONE', 'NEEDS_HUMAN', 'BLOCKED_EXTERNAL']);

function cleanCategory(value, fallback = 'unspecified') {
  const text = String(value || fallback).trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(text) ? text : fallback;
}

function terminalIdentity(objective) {
  const value = [
    objective.id,
    objective.status,
    objective.completed_at || objective.updated_at || objective.created_at || 'unknown-time',
  ].join('\n');
  return crypto.createHash('sha256').update(value).digest('hex');
}

function taskSummary(objective) {
  const tasks = Array.isArray(objective.tasks) ? objective.tasks : [];
  const counts = { total: tasks.length, done: 0, needs_human: 0, blocked_external: 0, other: 0 };
  for (const task of tasks) {
    if (task.status === 'DONE') counts.done += 1;
    else if (task.status === 'NEEDS_HUMAN') counts.needs_human += 1;
    else if (task.status === 'BLOCKED_EXTERNAL') counts.blocked_external += 1;
    else counts.other += 1;
  }
  return counts;
}

function buildRuntimeHandoff(objective, env = process.env) {
  if (!objective || !TERMINAL_STATUSES.has(objective.status)) throw new Error('runtime_objective_not_terminal');
  const summary = taskSummary(objective);
  const successful = objective.status === 'DONE';
  const stopReason = cleanCategory(objective.stop_reason, successful ? 'objective_verified' : 'continuation_required');
  const branch = /^[A-Za-z0-9._/-]{1,256}$/.test(String(env.RAILWAY_GIT_BRANCH || ''))
    ? env.RAILWAY_GIT_BRANCH
    : 'main';
  const headCommit = /^[a-f0-9]{7,64}$/i.test(String(env.RAILWAY_GIT_COMMIT_SHA || ''))
    ? env.RAILWAY_GIT_COMMIT_SHA
    : 'runtime-head-unavailable';
  const status = objective.status;
  return {
    handoff_id: `ADS-RUNTIME-${terminalIdentity(objective)}`,
    schema_version: '1.0',
    phase: 'AUTONOMOUS_RUNTIME',
    goal: 'Preserve sanitized continuity for a terminal Parma Ads Agent objective.',
    status,
    architecture_decisions: [
      'Personal OS remains the global control plane.',
      'Terminal runtime evidence is transferred without provider payloads or credentials.',
    ],
    decisions_pending: status === 'NEEDS_HUMAN' ? ['A human decision is required before continuation.'] : [],
    workspace: 'railway-runtime',
    repository: 'parmaberlin-cmd/parma-ads-agent',
    branch,
    head_commit: headCommit,
    files_created: [],
    files_modified: [],
    implemented: [
      `Observed terminal runtime status ${status}.`,
      'Prepared a deterministic secret-free Personal OS handoff.',
    ],
    tests_run: ['Autonomous runtime validation gates.'],
    test_results: {
      overall: successful ? 'PASS' : 'FAIL',
      passed: summary.done,
      failed: successful ? 0 : Math.max(1, summary.total - summary.done),
      summary: successful
        ? 'The objective reached verified terminal completion.'
        : `The objective stopped fail-closed with category ${stopReason}.`,
    },
    security_gates: [
      { gate: 'secret-free-handoff', status: 'PASS' },
      { gate: 'provider-write-authority-not-granted', status: 'PASS' },
      { gate: 'spend-authority-not-granted', status: 'PASS' },
    ],
    authority_state: 'The handoff grants no provider, publication or spend authority.',
    credential_boundaries: 'Only runtime credential references remain outside the handoff payload.',
    human_interruption_policy: 'Interrupt on credentials, provider writes, spend, publication or unresolved terminal blockers.',
    autonomy_scope: 'Sanitized continuity transfer and allowlisted local read-only dispatch only.',
    actions_requiring_human: [
      'Credential changes.',
      'Provider writes, publication or spend changes.',
      'Resolution of NEEDS_HUMAN terminal states.',
    ],
    actions_allowed_autonomously: [
      'Persist this secret-free handoff.',
      'Refresh the local read-only Control Tower status.',
    ],
    approval_configuration_verified: {
      repository_config: false,
      global_config_merge: false,
      status: 'NOT_APPLICABLE',
      detail: 'Runtime handoff generation does not evaluate approval configuration.',
    },
    known_issues: successful ? [] : [`Terminal category: ${stopReason}.`],
    blockers: status === 'BLOCKED_EXTERNAL' ? [`External blocker category: ${stopReason}.`] : [],
    last_completed_action: successful
      ? 'The autonomous objective completed its validation sequence.'
      : 'The runtime recorded a fail-closed terminal state.',
    current_action: 'Transfer the terminal state to Personal OS.',
    next_action: successful
      ? 'Mostra lo stato della coda.'
      : status === 'NEEDS_HUMAN'
        ? 'Review the required human decision in the Control Tower.'
        : 'Resolve the external blocker before retrying the objective.',
    commands_needed_to_continue: [],
    do_not_touch: ['Google Ads', 'Meta', 'budgets', 'spend', 'publications', 'credentials'],
    rollback_information: 'Disable the handoff outbox; existing records remain inert continuity evidence.',
    evidence: [
      `objective_status=${status}`,
      `stop_category=${stopReason}`,
      `tasks_total=${summary.total}`,
      `tasks_done=${summary.done}`,
      `tasks_needs_human=${summary.needs_human}`,
      `tasks_blocked_external=${summary.blocked_external}`,
    ],
  };
}

function emitTerminalRuntimeHandoffs({ state, env = process.env, outbox } = {}) {
  const target = outbox || PersonalOsHandoffOutbox.fromEnv(env);
  if (!target) return { status: 'BLOCKED', reason: 'personal_os_handoff_outbox_disabled', queued: 0, duplicates: 0 };
  if (!state || !Array.isArray(state.objectives)) throw new Error('runtime_state_invalid');
  const results = state.objectives
    .filter(objective => TERMINAL_STATUSES.has(objective.status))
    .map(objective => target.submit(buildRuntimeHandoff(objective, env)));
  return {
    status: 'EMITTED',
    queued: results.filter(result => result.duplicate === false).length,
    duplicates: results.filter(result => result.duplicate === true).length,
    handoff_ids: results.map(result => result.handoff_id),
    provider_writes: 0,
    spend_changed: false,
    published: false,
  };
}

function producerFailureCategory(error) {
  const allowed = new Set([
    'handoff_outbox_directory_unavailable',
    'handoff_outbox_directory_invalid',
    'handoff_signer_identity_invalid',
    'handoff_signing_key_unavailable',
    'handoff_signing_key_invalid',
    'handoff_outbox_integrity_failed',
    'handoff_outbox_write_failed_closed',
    'handoff_id_content_conflict',
    'canonical_handoff_invalid',
    'canonical_handoff_secret_material_detected',
    'runtime_state_invalid',
    'runtime_objective_not_terminal',
  ]);
  return allowed.has(error?.message) ? error.message : 'personal_os_runtime_handoff_failed_closed';
}

module.exports = {
  TERMINAL_STATUSES,
  buildRuntimeHandoff,
  emitTerminalRuntimeHandoffs,
  producerFailureCategory,
  taskSummary,
  terminalIdentity,
};
