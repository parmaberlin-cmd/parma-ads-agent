'use strict';

const {
  POLICY_CLASSES,
  ROLLBACK_STATUSES,
  DEFAULT_EXPLORATION_POLICY,
  validateMutationRequest,
  classifyMutation,
  buildStateSnapshot,
  buildRollbackPlan,
  verifyReadAfterWrite,
  verifyRollbackResult,
  normalizeExplorationPolicy,
  buildApprovalPacket,
  AdsKillSwitch,
} = require('./ads-controlled-execution-core');

function clockIso(now) {
  return new Date(now()).toISOString();
}

function failClosed(blockers, extra = {}) {
  return {
    accepted: false,
    status: 'BLOCKED',
    writes_executed: 0,
    provider_write: false,
    blockers,
    ...extra,
  };
}

function createGoogleAdsMutationGateway({
  store,
  readBefore,
  readAfter = null,
  applyMutation = null,
  killSwitch = new AdsKillSwitch(),
  explorationPolicy = DEFAULT_EXPLORATION_POLICY,
  now = Date.now,
  writesEnabled = false,
} = {}) {
  if (!store || typeof store.append !== 'function' || typeof store.get !== 'function') {
    throw new Error('controlled_ads_store_required');
  }
  if (typeof readBefore !== 'function') throw new Error('read_before_required');
  if (typeof killSwitch?.isBlocked !== 'function') throw new Error('kill_switch_required');
  const policy = normalizeExplorationPolicy(explorationPolicy);

  async function preflight(request, { actualAfter = null } = {}) {
    const validation = validateMutationRequest(request);
    if (!validation.ok) {
      return failClosed(['invalid_mutation_request'], { validation_errors: validation.errors, missing_fields: validation.missing });
    }
    const mutation = validation.value;
    const classification = classifyMutation(mutation);
    if (!classification.valid) {
      return failClosed([classification.reason || 'mutation_classification_failed'], { mutation_type: mutation.mutation_type, classification });
    }
    const switchState = killSwitch.isBlocked({ campaign_id: mutation.campaign_id, experiment_id: mutation.experiment_id || null });
    if (switchState.blocked) return failClosed(switchState.reasons, { mutation_type: mutation.mutation_type });
    if (classification.protected) return failClosed(['protected_operation_denied'], { mutation_type: mutation.mutation_type });
    if (mutation.expires_at && now() >= Date.parse(mutation.expires_at)) return failClosed(['mutation_expired']);
    if (mutation.max_cost_eur !== undefined && mutation.max_cost_eur > policy.max_experiment_cost_eur) {
      return failClosed(['mutation_cost_cap_exceeded']);
    }

    const rawBefore = await readBefore(mutation);
    const snapshot = buildStateSnapshot(rawBefore, { now, source: 'google_ads_controlled_read' });
    const stateRecord = store.append('state', snapshot);
    snapshot.version_id = stateRecord.id;

    const rollback = buildRollbackPlan(mutation, snapshot, { now });
    if (rollback.status !== ROLLBACK_STATUSES.READY) {
      return failClosed(['rollback_not_ready'], { mutation_type: mutation.mutation_type, rollback_status: rollback.status });
    }

    return {
      accepted: true,
      status: 'PREFLIGHT_PASSED',
      mutation,
      classification,
      snapshot,
      snapshot_id: stateRecord.id,
      rollback,
      approval_packet: buildApprovalPacket({ id: mutation.experiment_id || 'change', hypothesis: mutation.reason, treatment: mutation.proposed_after_state, max_cost_eur: mutation.max_cost_eur ?? 0, start_at: new Date(now()).toISOString(), expires_at: mutation.expires_at || new Date(now()).toISOString(), primary_success_metric: 'read_after_write_verified', stop_loss_condition: 'rollback_ready', rollback_plan: rollback }, mutation),
    };
  }

  async function simulate(request, { actualAfter = null, readAfterFailure = false } = {}) {
    const checked = await preflight(request, { actualAfter });
    if (!checked.accepted) return checked;
    const mutation = checked.mutation;
    const simulatedActual = readAfterFailure ? structuredClone(mutation.before_state) : (actualAfter ?? structuredClone(mutation.proposed_after_state));
    const verification = verifyReadAfterWrite({
      expected: mutation.proposed_after_state,
      actual: simulatedActual,
      readCompletedAt: clockIso(now),
    });
    const rollbackVerification = verifyRollbackResult({
      expected: checked.rollback.expected_restored_state,
      actual: structuredClone(mutation.before_state),
      snapshot: checked.snapshot,
    });
    store.append('change', {
      change_id: mutation.change_id,
      objective_id: mutation.objective_id,
      campaign_id: mutation.campaign_id,
      mutation_type: mutation.mutation_type,
      snapshot_id: checked.snapshot_id,
      status: verification.verified ? 'SIMULATED_VERIFIED' : 'SIMULATED_READ_AFTER_WRITE_FAILED',
      simulated: true,
      writes_executed: 0,
      provider_write: false,
      verification,
      rollback: { plan: checked.rollback, verification: rollbackVerification },
    });
    store.append('audit', {
      event: 'simulated_mutation',
      change_id: mutation.change_id,
      status: verification.verified ? 'SIMULATED_VERIFIED' : 'SIMULATED_READ_AFTER_WRITE_FAILED',
      snapshot_id: checked.snapshot_id,
      at: clockIso(now),
    });
    return {
      accepted: true,
      status: verification.verified ? 'SIMULATED_VERIFIED' : 'SIMULATED_READ_AFTER_WRITE_FAILED',
      mutation,
      classification: checked.classification,
      snapshot_id: checked.snapshot_id,
      writes_executed: 0,
      provider_write: false,
      read_after_write: verification,
      rollback: rollbackVerification,
    };
  }

  async function execute(request, { approved = false, actualAfter = null } = {}) {
    const checked = await preflight(request, { actualAfter });
    if (!checked.accepted) return checked;
    if (writesEnabled !== true) return failClosed(['writes_disabled_by_default'], { mutation_type: checked.mutation.mutation_type });
    const mutation = checked.mutation;
    if (checked.classification.approval_required && approved !== true) return failClosed(['operator_approval_required']);
    const switchState = killSwitch.isBlocked({ campaign_id: mutation.campaign_id, experiment_id: mutation.experiment_id || null });
    if (switchState.blocked) return failClosed(switchState.reasons);
    if (typeof applyMutation !== 'function') return failClosed(['live_executor_not_wired']);

    await applyMutation(mutation, { mode: 'live' });
    const rawAfter = typeof readAfter === 'function' ? await readAfter(mutation) : actualAfter;
    const verification = verifyReadAfterWrite({
      expected: mutation.proposed_after_state,
      actual: rawAfter || {},
      readCompletedAt: clockIso(now),
    });
    store.append('change', {
      change_id: mutation.change_id,
      objective_id: mutation.objective_id,
      campaign_id: mutation.campaign_id,
      mutation_type: mutation.mutation_type,
      snapshot_id: checked.snapshot_id,
      status: verification.verified ? 'VERIFIED' : 'RECONCILIATION_REQUIRED',
      simulated: false,
      writes_executed: 1,
      provider_write: true,
      verification,
      rollback: checked.rollback,
    });
    store.append('audit', {
      event: 'live_mutation',
      change_id: mutation.change_id,
      status: verification.verified ? 'VERIFIED' : 'RECONCILIATION_REQUIRED',
      snapshot_id: checked.snapshot_id,
      at: clockIso(now),
    });
    return {
      accepted: verification.verified,
      status: verification.verified ? 'VERIFIED' : 'RECONCILIATION_REQUIRED',
      mutation,
      classification: checked.classification,
      snapshot_id: checked.snapshot_id,
      writes_executed: 1,
      provider_write: true,
      read_after_write: verification,
      rollback_plan: checked.rollback,
    };
  }

  return {
    preflight,
    simulate,
    execute,
    status: () => ({
      writes_enabled: writesEnabled === true,
      writes_allowed: writesEnabled === true,
      execution_allowed: writesEnabled === true,
      spend_allowed: false,
      autonomy_class: 'observe_and_propose',
      policy,
    }),
  };
}

module.exports = {
  POLICY_CLASSES,
  createGoogleAdsMutationGateway,
  clockIso,
};
