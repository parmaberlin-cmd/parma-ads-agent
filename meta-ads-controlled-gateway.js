'use strict';

const crypto = require('node:crypto');
const {
  META_DOMAINS,
  POLICY_CLASSES,
  classifyMetaMutationType,
  validateMetaMutationRequest,
} = require('./meta-execution-domains');

const ROLLBACK_STATUSES = Object.freeze({
  READY: 'ROLLBACK_READY',
  EXECUTING: 'ROLLBACK_EXECUTING',
  VERIFIED: 'ROLLBACK_VERIFIED',
  FAILED: 'ROLLBACK_FAILED',
});

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function clockIso(now) {
  return new Date(now()).toISOString();
}

function failClosed(blockers, extra = {}) {
  return {
    accepted: false,
    status: blockers.includes('META_ADS_BLOCKED_EXTERNAL') ? 'META_ADS_BLOCKED_EXTERNAL' : 'BLOCKED',
    writes_executed: 0,
    provider_write: false,
    spend_changed: false,
    blockers: [...new Set(blockers)],
    ...extra,
  };
}

function buildMetaStateSnapshot(objects, { now = Date.now, source = 'meta_ads_controlled_read' } = {}) {
  const capturedAt = clockIso(now);
  return {
    schema: 'meta_ads.controlled_state.v1',
    source,
    captured_at: capturedAt,
    objects: structuredClone(objects),
    digest: sha256({ captured_at: capturedAt, objects }),
    writes_allowed: false,
    spend_allowed: false,
  };
}

function inverseMutationType(mutationType) {
  const map = {
    PAUSE_AD: 'SET_AGENT_CREATED_AD_STATUS',
    ENABLE_AGENT_CREATED_AD: 'SET_AGENT_CREATED_AD_STATUS',
    PAUSE_ADSET: 'ENABLE_AGENT_CREATED_ADSET',
    ENABLE_AGENT_CREATED_ADSET: 'PAUSE_ADSET',
    CREATE_PAUSED_AD_VARIANT: 'SET_AGENT_CREATED_AD_STATUS',
    UPDATE_AGENT_CREATED_CREATIVE: 'UPDATE_AGENT_CREATED_CREATIVE',
    SET_AGENT_CREATED_AD_STATUS: 'SET_AGENT_CREATED_AD_STATUS',
  };
  return map[mutationType] || null;
}

function buildMetaRollbackPlan(mutation, snapshot, { now = Date.now } = {}) {
  const inverseType = inverseMutationType(mutation.mutation_type);
  if (!inverseType || !snapshot) {
    return { status: ROLLBACK_STATUSES.FAILED, reason: 'rollback_plan_unavailable', inverse: null };
  }
  const inverse = {
    ...structuredClone(mutation),
    change_id: `${mutation.change_id}-rollback`,
    mutation_type: inverseType,
    before_state: structuredClone(mutation.proposed_after_state),
    proposed_after_state: structuredClone(mutation.before_state),
    reason: 'rollback_inverse_mutation',
    evidence: [{ type: 'rollback_plan', reference: `inverse_of:${mutation.change_id}` }],
  };
  return {
    status: ROLLBACK_STATUSES.READY,
    reason: 'inverse_mutation_ready',
    mutation_id: mutation.change_id,
    snapshot_id: snapshot.version_id || snapshot.id || null,
    inverse,
    expected_restored_state: structuredClone(mutation.before_state || {}),
    created_at: clockIso(now),
  };
}

function verifyMetaReadAfterWrite({ expected = {}, actual = {}, readCompletedAt = null } = {}) {
  const mismatches = [];
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    if (!Object.prototype.hasOwnProperty.call(actual, key) || stableStringify(actual[key]) !== stableStringify(expected[key])) {
      mismatches.push({ field: key, expected: expected[key], actual: actual[key] });
    }
  }
  return {
    required: true,
    verified: mismatches.length === 0 && Boolean(readCompletedAt),
    mismatches,
    read_completed_at: readCompletedAt || null,
  };
}

function createMetaAdsMutationGateway({
  store,
  readBefore,
  readAfter = null,
  applyMutation = null,
  killSwitch = null,
  spendControl = null,
  accountRestriction = { blocking: false, reason: null },
  now = Date.now,
  writesEnabled = false,
  spendEnabled = false,
} = {}) {
  if (!store || typeof store.append !== 'function' || typeof store.get !== 'function') {
    throw new Error('controlled_meta_ads_store_required');
  }
  if (typeof readBefore !== 'function') throw new Error('read_before_required');
  if (typeof killSwitch?.isBlocked !== 'function') throw new Error('kill_switch_required');

  async function preflight(request) {
    const validation = validateMetaMutationRequest(request);
    if (!validation.ok) {
      return failClosed(['invalid_mutation_request'], { validation_errors: validation.errors, missing_fields: validation.missing });
    }
    const mutation = validation.value;
    const classification = classifyMetaMutationType(mutation.mutation_type);
    if (!classification.valid) return failClosed([classification.reason || 'mutation_classification_failed']);
    if (classification.protected) return failClosed(['protected_operation_denied'], { mutation_type: mutation.mutation_type });
    if (accountRestriction?.blocking) return failClosed(['META_ADS_BLOCKED_EXTERNAL'], { restriction: accountRestriction });
    const switchState = killSwitch.isBlocked({ ad_account_id: mutation.ad_account_id, mutation_type: mutation.mutation_type });
    if (switchState.blocked) return failClosed(switchState.reasons);
    if (mutation.expires_at && now() >= Date.parse(mutation.expires_at)) return failClosed(['mutation_expired']);

    const spendRequired = mutation.max_cost_eur > 0 || mutation.mutation_type === 'SPEND_INCREASE' || classification.approval_required;
    if (spendRequired) {
      if (!spendEnabled) return failClosed(['spend_disabled_by_default']);
      if (!spendControl || typeof spendControl.assert !== 'function') return failClosed(['spend_control_not_wired']);
      const spendCheck = spendControl.assert(mutation, { now });
      if (!spendCheck.allowed) return failClosed(spendCheck.blockers || ['spend_authorization_failed']);
    }

    const rawBefore = await readBefore(mutation);
    const snapshot = buildMetaStateSnapshot(rawBefore, { now, source: 'meta_ads_controlled_read' });
    const stateRecord = store.append('state', snapshot);
    snapshot.version_id = stateRecord.id;
    const rollback = buildMetaRollbackPlan(mutation, snapshot, { now });
    if (rollback.status !== ROLLBACK_STATUSES.READY) return failClosed(['rollback_not_ready']);

    return {
      accepted: true,
      status: 'PREFLIGHT_PASSED',
      mutation,
      classification,
      snapshot,
      snapshot_id: stateRecord.id,
      rollback,
      writes_allowed: writesEnabled === true,
      spend_allowed: spendEnabled === true && spendRequired,
    };
  }

  async function execute(request, { approved = false, actualAfter = null } = {}) {
    const checked = await preflight(request);
    if (!checked.accepted) return checked;
    const mutation = checked.mutation;
    if (writesEnabled !== true) return failClosed(['writes_disabled_by_default'], { mutation_type: mutation.mutation_type });
    if (checked.classification.approval_required && approved !== true) return failClosed(['operator_approval_required']);
    if (typeof applyMutation !== 'function') return failClosed(['live_executor_not_wired']);
    const switchState = killSwitch.isBlocked({ ad_account_id: mutation.ad_account_id, mutation_type: mutation.mutation_type });
    if (switchState.blocked) return failClosed(switchState.reasons);

    await applyMutation(mutation, { mode: 'live' });
    const rawAfter = typeof readAfter === 'function' ? await readAfter(mutation) : actualAfter;
    const verification = verifyMetaReadAfterWrite({
      expected: mutation.proposed_after_state,
      actual: rawAfter || {},
      readCompletedAt: clockIso(now),
    });
    store.append('change', {
      change_id: mutation.change_id,
      domain: META_DOMAINS.ADS_EXECUTION,
      ad_account_id: mutation.ad_account_id,
      mutation_type: mutation.mutation_type,
      snapshot_id: checked.snapshot_id,
      status: verification.verified ? 'VERIFIED' : 'RECONCILIATION_REQUIRED',
      writes_executed: 1,
      provider_write: true,
      spend_changed: mutation.max_cost_eur > 0 || mutation.mutation_type === 'SPEND_INCREASE',
      verification,
      rollback: checked.rollback,
    });
    store.append('audit', {
      event: 'live_meta_mutation',
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
      spend_changed: mutation.max_cost_eur > 0 || mutation.mutation_type === 'SPEND_INCREASE',
      read_after_write: verification,
      rollback_plan: checked.rollback,
    };
  }

  return {
    preflight,
    execute,
    status: () => ({
      writes_enabled: writesEnabled === true,
      writes_allowed: writesEnabled === true,
      spend_enabled: spendEnabled === true,
      spend_allowed: false,
      account_restriction: accountRestriction || null,
      autonomy_class: 'observe_and_propose',
    }),
  };
}

module.exports = {
  ROLLBACK_STATUSES,
  buildMetaStateSnapshot,
  buildMetaRollbackPlan,
  verifyMetaReadAfterWrite,
  createMetaAdsMutationGateway,
};
