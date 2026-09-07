'use strict';

const { customerFrom } = require('./google-write-path');
const { createGoogleAdsMutationGateway } = require('./google-ads-mutation-gateway');
const {
  CANARY,
  canaryAuditIntegrityKeyAvailable,
  createCanaryAuditStore,
  createCanaryReadAdapter,
  createCanaryMutationAdapter,
  issueCanaryAuthorization,
  validateCanaryCustomer,
  canaryKillSwitch,
  canaryKillSwitchPermits,
  buildCanaryMutationRequest,
} = require('./google-ads-canary-core');

const VALID_MODES = new Set(['VALIDATE_ONLY', 'EXECUTE_CANARY']);

function blockedResult(blockers, extra = {}) {
  return {
    status: 'BLOCKED',
    blockers: [...new Set(blockers)],
    writes_executed: 0,
    provider_write: false,
    mutations_executed: 0,
    financial_exposure_eur: 0,
    ...extra,
  };
}

function nowValue(now) {
  const value = now();
  if (!Number.isSafeInteger(value)) throw new Error('invalid_canary_clock');
  return value;
}

function buildCanaryContext({
  env = process.env,
  now = Date.now,
  customer = null,
  auditStore = null,
  authorization = null,
  readAdapter = null,
  mutationAdapter = null,
  http = null,
  requireDurableMount = null,
} = {}) {
  const blockers = [];
  const writeEnabled = env.GOOGLE_ADS_CANARY_ENABLED === 'true';
  const killPermits = canaryKillSwitchPermits(env);
  const durableRequired = requireDurableMount === null ? writeEnabled : requireDurableMount === true;

  if (!writeEnabled) blockers.push('writes_disabled_by_default');
  if (env.GOOGLE_ADS_WRITE_KILL_SWITCH !== 'false') blockers.push('google_ads_write_kill_switch_not_explicitly_false');
  if (env.GOOGLE_ADS_CANARY_KILL_SWITCH !== 'false') blockers.push('canary_kill_switch_not_explicitly_permitted');
  if (!canaryAuditIntegrityKeyAvailable(env)) blockers.push('audit_integrity_key_unavailable');

  let store = null;
  if (auditStore) {
    store = auditStore;
  } else if (canaryAuditIntegrityKeyAvailable(env)) {
    try {
      store = createCanaryAuditStore({ env, now, requireDurableMount: durableRequired });
    } catch (error) {
      blockers.push(error.message === 'audit_path_unwritable' || error.message === 'audit_path_unavailable' || error.message === 'durable_audit_mount_unverified'
        ? 'audit_storage_unavailable'
        : error.message);
    }
  } else {
    blockers.push('audit_storage_unavailable');
  }

  let auth = null;
  try {
    auth = authorization || issueCanaryAuthorization({
      now,
      expiresAt: Date.parse(env.GOOGLE_ADS_CANARY_EXPIRES_AT),
    });
  } catch {
    blockers.push('authorization_unavailable');
  }
  if (auth) {
    const addCheck = auth.canConsumeStep(CANARY.add_mutation_type, {
      now,
      customer_id: CANARY.customer_id,
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
    });
    if (!addCheck.allowed) blockers.push(addCheck.reason);
  }

  let activeCustomer = customer;
  if (!activeCustomer && writeEnabled) {
    try {
      activeCustomer = customerFrom(env);
    } catch {
      blockers.push('google_customer_unavailable');
    }
  }
  if (activeCustomer && !validateCanaryCustomer(activeCustomer)) blockers.push('canary_customer_mismatch');

  let activeReadAdapter = readAdapter;
  let activeMutationAdapter = mutationAdapter;
  if (activeCustomer) {
    if (!activeReadAdapter) {
      try {
        activeReadAdapter = createCanaryReadAdapter(activeCustomer);
      } catch {
        blockers.push('canary_read_adapter_unavailable');
      }
    }
    if (!activeMutationAdapter) {
      try {
        activeMutationAdapter = createCanaryMutationAdapter(activeCustomer, { http });
      } catch {
        blockers.push('canary_mutation_adapter_unavailable');
      }
    }
  }

  if (!writeEnabled || !killPermits) {
    // Default safe state: do not construct a live gateway or call provider adapters.
    return { ok: false, blockers, context: null };
  }

  if (!store || !auth || !activeCustomer || !activeReadAdapter || !activeMutationAdapter) {
    return { ok: false, blockers: [...new Set(blockers)], context: null };
  }

  const killSwitch = canaryKillSwitch(env);
  let lastCreatedResourceName = null;
  let rollbackOwnership = null;

  async function readCanaryState() {
    return activeReadAdapter.readState({
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
    });
  }

  async function applyMutation(mutation, options = {}) {
    const mode = options.mode === 'live' ? false : true;
    let input;
    if (mutation.mutation_type === 'add_exact_negative_keyword') {
      input = {
        mutation_type: CANARY.add_mutation_type,
        campaign_id: mutation.campaign_id,
        keyword: CANARY.keyword,
        match_type: 'EXACT',
      };
    } else if (mutation.mutation_type === 'remove_agent_created_negative_keyword') {
      const resourceName = Array.isArray(mutation.object_identifiers) ? mutation.object_identifiers[0] : null;
      input = {
        mutation_type: CANARY.remove_mutation_type,
        campaign_id: mutation.campaign_id,
        keyword: CANARY.keyword,
        resource_name: resourceName,
        ownership: rollbackOwnership,
      };
    } else {
      throw new Error('non_allowlisted_canary_mutation');
    }
    const response = await activeMutationAdapter.mutate(input, { validate_only: mode });
    const createdResourceName = response?.results?.[0]?.resourceName;
    if (input.mutation_type === CANARY.add_mutation_type && createdResourceName) {
      lastCreatedResourceName = String(createdResourceName);
    }
    return response;
  }

  const gateway = createGoogleAdsMutationGateway({
    store,
    killSwitch,
    now,
    writesEnabled: true,
    readBefore: readCanaryState,
    readAfter: readCanaryState,
    applyMutation,
  });

  return {
    ok: true,
    blockers: [],
    context: {
      env,
      now,
      store,
      auth,
      customer: activeCustomer,
      readAdapter: activeReadAdapter,
      mutationAdapter: activeMutationAdapter,
      killSwitch,
      gateway,
      get lastCreatedResourceName() { return lastCreatedResourceName; },
      set rollbackOwnershipValue(value) { rollbackOwnership = value; },
      get rollbackOwnershipValue() { return rollbackOwnership; },
    },
  };
}

async function recordContextSnapshot(context, phase, payload) {
  context.store.append('state', {
    phase,
    customer_id: CANARY.customer_id,
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
    ...payload,
  });
}

async function findCreatedResource(context) {
  if (context.lastCreatedResourceName) return context.lastCreatedResourceName;
  const rows = await context.readAdapter.readExactNegative({
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
  });
  return rows[0]?.resource_name || null;
}

async function attemptRollback(context, { addChangeId, resourceName = null, reason }) {
  if (context._rollbackAttempted) {
    return {
      status: 'CRITICAL_ROLLBACK_FAILURE',
      reason,
      customer_id: CANARY.customer_id,
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
      resource_name: resourceName,
      blockers: ['rollback_already_attempted'],
      writes_executed: 1,
      provider_write: true,
      mutations_executed: 1,
      financial_exposure_eur: 0,
    };
  }
  context._rollbackAttempted = true;
  const resolvedResource = resourceName || await findCreatedResource(context);
  if (!resolvedResource) {
    return {
      status: 'CRITICAL_ROLLBACK_FAILURE',
      reason: reason || 'add_verification_failed_and_rollback_target_unavailable',
      customer_id: CANARY.customer_id,
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
      resource_name: null,
      blockers: ['rollback_target_unavailable'],
      writes_executed: 1,
      provider_write: true,
      mutations_executed: 1,
      financial_exposure_eur: 0,
    };
  }

  context.store.append('audit', {
    phase: 'emergency_rollback_started',
    reason,
    customer_id: CANARY.customer_id,
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
    resource_name: resolvedResource,
    at: new Date(context.now()).toISOString(),
  });

  let rollbackAuth;
  try {
    rollbackAuth = context.auth.consumeStep(CANARY.remove_mutation_type, {
      now: context.now,
      customer_id: CANARY.customer_id,
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
    });
  } catch (error) {
    return {
      status: 'CRITICAL_ROLLBACK_FAILURE',
      reason: error.message,
      customer_id: CANARY.customer_id,
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
      resource_name: resolvedResource,
      blockers: [error.message],
      writes_executed: 1,
      provider_write: true,
      mutations_executed: 1,
      financial_exposure_eur: 0,
    };
  }
  context.auth = rollbackAuth;

  context.rollbackOwnershipValue = {
    agent_created: true,
    customer_id: CANARY.customer_id,
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
    resource_name: resolvedResource,
    change_id: addChangeId,
  };

  const rollbackRequest = buildCanaryMutationRequest({
    phase: 'REMOVE',
    resourceName: resolvedResource,
    changeId: `${addChangeId}-rollback`,
    expiresAt: rollbackAuth.expires_at,
    now: context.now,
  });
  context.store.append('audit', {
    phase: 'rollback_mutation_request',
    change_id: rollbackRequest.change_id,
    mutation_type: rollbackRequest.mutation_type,
    resource_name: resolvedResource,
    at: new Date(context.now()).toISOString(),
  });

  let rollbackResult;
  try {
    rollbackResult = await context.gateway.execute(rollbackRequest, { approved: false });
  } catch (error) {
    rollbackResult = {
      status: 'RECONCILIATION_REQUIRED',
      error: error.message,
    };
  }
  context.store.append('audit', {
    phase: 'rollback_mutation_result',
    status: rollbackResult.status,
    provider_write: rollbackResult.provider_write === true,
    read_after_write: rollbackResult.read_after_write || null,
    at: new Date(context.now()).toISOString(),
  });

  const finalRead = await context.readAdapter.readState({
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
  });
  await recordContextSnapshot(context, 'final_verified_state_after_emergency_rollback', finalRead);

  const verified = rollbackResult.status === 'VERIFIED' && finalRead.canary_exact_negative_present === false;
  if (verified) {
    return {
      status: 'CANARY_ROLLED_BACK_AFTER_ADD_VERIFICATION_FAILURE',
      reason,
      writes_executed: 2,
      provider_write: true,
      mutations_executed: 2,
      financial_exposure_eur: 0,
      rollback_verified: true,
      resource_name: resolvedResource,
    };
  }

  return {
    status: 'CRITICAL_ROLLBACK_FAILURE',
    reason: reason || 'rollback_verification_failed',
    customer_id: CANARY.customer_id,
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
    resource_name: resolvedResource,
    blockers: ['rollback_verification_failed'],
    writes_executed: 2,
    provider_write: true,
    mutations_executed: 2,
    financial_exposure_eur: 0,
  };
}

async function runCanary(mode, deps = {}) {
  if (!VALID_MODES.has(mode)) throw new Error('invalid_canary_mode');
  const built = buildCanaryContext(deps);
  if (!built.ok) {
    return blockedResult(built.blockers, {
      mode,
      financial_exposure_eur: 0,
      real_google_ads_mutation_attempted: false,
    });
  }
  const context = built.context;
  context._rollbackAttempted = false;
  context.store.append('audit', {
    phase: 'canary_invocation',
    mode,
    customer_id: CANARY.customer_id,
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
    authorization_id: context.auth.authorization_id,
    at: new Date(context.now()).toISOString(),
  });

  const before = await context.readAdapter.readState({
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
  });
  if (before.canary_exact_negative_present) {
    return blockedResult(['canary_keyword_already_present'], {
      mode,
      snapshot: before,
      real_google_ads_mutation_attempted: false,
    });
  }
  await recordContextSnapshot(context, 'before_snapshot', before);

  const expiresAt = context.auth.expires_at;
  const addRequest = buildCanaryMutationRequest({
    phase: 'ADD',
    expiresAt,
    now: context.now,
  });
  context.store.append('audit', {
    phase: 'add_mutation_request',
    change_id: addRequest.change_id,
    mutation_type: addRequest.mutation_type,
    campaign_id: addRequest.campaign_id,
    keyword: CANARY.keyword,
    at: new Date(context.now()).toISOString(),
  });

  const preflight = await context.gateway.preflight(addRequest);
  if (!preflight.accepted) {
    return blockedResult(preflight.blockers || ['canary_preflight_failed'], {
      mode,
      real_google_ads_mutation_attempted: false,
    });
  }
  context.store.append('audit', {
    phase: 'preflight_green',
    mode,
    snapshot_id: preflight.snapshot_id,
    at: new Date(context.now()).toISOString(),
  });

  if (mode === 'VALIDATE_ONLY') {
    return {
      status: 'READY_FOR_CANARY',
      mode,
      snapshot_id: preflight.snapshot_id,
      authorization_id: context.auth.authorization_id,
      customer_id: CANARY.customer_id,
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
      writes_executed: 0,
      provider_write: false,
      mutations_executed: 0,
      financial_exposure_eur: 0,
      automatic_rollback_required: true,
      real_google_ads_mutation_attempted: false,
    };
  }

  let addAuth;
  try {
    addAuth = context.auth.consumeStep(CANARY.add_mutation_type, {
      now: context.now,
      customer_id: CANARY.customer_id,
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
    });
  } catch (error) {
    return blockedResult([error.message], {
      mode,
      real_google_ads_mutation_attempted: false,
    });
  }
  context.auth = addAuth;
  context.store.append('audit', {
    phase: 'add_authorized',
    authorization_id: addAuth.authorization_id,
    mutation_type: CANARY.add_mutation_type,
    at: new Date(context.now()).toISOString(),
  });

  let addResult;
  try {
    addResult = await context.gateway.execute(addRequest, { approved: false });
  } catch (error) {
    context.store.append('audit', {
      phase: 'add_execution_exception',
      error: error.message,
      at: new Date(context.now()).toISOString(),
    });
    addResult = { status: 'RECONCILIATION_REQUIRED', error: error.message };
  }

  context.store.append('audit', {
    phase: 'add_mutation_result',
    status: addResult.status,
    provider_write: addResult.provider_write === true,
    read_after_write: addResult.read_after_write || null,
    at: new Date(context.now()).toISOString(),
  });

  const addVerified = addResult.status === 'VERIFIED' && addResult.read_after_write?.verified === true;
  if (!addVerified) {
    return attemptRollback(context, {
      addChangeId: addRequest.change_id,
      resourceName: context.lastCreatedResourceName || null,
      reason: 'add_verification_failed',
    });
  }

  const readAfterAdd = await context.readAdapter.readState({
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
  });
  await recordContextSnapshot(context, 'read_after_add', readAfterAdd);
  const createdResource = await findCreatedResource(context);
  if (!readAfterAdd.canary_exact_negative_present || !createdResource) {
    return attemptRollback(context, {
      addChangeId: addRequest.change_id,
      resourceName: createdResource,
      reason: 'read_after_add_failed',
    });
  }

  let rollbackAuth;
  try {
    rollbackAuth = context.auth.consumeStep(CANARY.remove_mutation_type, {
      now: context.now,
      customer_id: CANARY.customer_id,
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
    });
  } catch (error) {
    return attemptRollback(context, {
      addChangeId: addRequest.change_id,
      resourceName: createdResource,
      reason: error.message,
    });
  }
  context.auth = rollbackAuth;
  context.rollbackOwnershipValue = {
    agent_created: true,
    customer_id: CANARY.customer_id,
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
    resource_name: createdResource,
    change_id: addRequest.change_id,
  };
  context.store.append('audit', {
    phase: 'rollback_authorized',
    authorization_id: rollbackAuth.authorization_id,
    mutation_type: CANARY.remove_mutation_type,
    resource_name: createdResource,
    at: new Date(context.now()).toISOString(),
  });

  const rollbackRequest = buildCanaryMutationRequest({
    phase: 'REMOVE',
    resourceName: createdResource,
    changeId: `${addRequest.change_id}-rollback`,
    expiresAt: rollbackAuth.expires_at,
    now: context.now,
  });
  context.store.append('audit', {
    phase: 'rollback_mutation_request',
    change_id: rollbackRequest.change_id,
    mutation_type: rollbackRequest.mutation_type,
    resource_name: createdResource,
    at: new Date(context.now()).toISOString(),
  });

  let rollbackResult;
  try {
    rollbackResult = await context.gateway.execute(rollbackRequest, { approved: false });
  } catch (error) {
    context.store.append('audit', {
      phase: 'rollback_execution_exception',
      error: error.message,
      at: new Date(context.now()).toISOString(),
    });
    rollbackResult = { status: 'RECONCILIATION_REQUIRED', error: error.message };
  }
  context.store.append('audit', {
    phase: 'rollback_mutation_result',
    status: rollbackResult.status,
    provider_write: rollbackResult.provider_write === true,
    read_after_write: rollbackResult.read_after_write || null,
    at: new Date(context.now()).toISOString(),
  });

  const finalState = await context.readAdapter.readState({
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
  });
  await recordContextSnapshot(context, 'final_verified_state', finalState);

  const rollbackVerified = rollbackResult.status === 'VERIFIED' && finalState.canary_exact_negative_present === false;
  if (rollbackVerified) {
    context.store.append('audit', {
      phase: 'canary_verified',
      at: new Date(context.now()).toISOString(),
    });
    return {
      status: 'CANARY_VERIFIED',
      mode,
      customer_id: CANARY.customer_id,
      campaign_id: CANARY.campaign_id,
      keyword: CANARY.keyword,
      resource_name: createdResource,
      writes_executed: 2,
      provider_write: true,
      mutations_executed: 2,
      financial_exposure_eur: 0,
      automatic_rollback_verified: true,
      real_google_ads_mutation_attempted: true,
    };
  }

  return {
    status: 'CRITICAL_ROLLBACK_FAILURE',
    reason: 'rollback_verification_failed',
    customer_id: CANARY.customer_id,
    campaign_id: CANARY.campaign_id,
    keyword: CANARY.keyword,
    resource_name: createdResource,
    blockers: ['rollback_verification_failed'],
    writes_executed: 2,
    provider_write: true,
    mutations_executed: 2,
    financial_exposure_eur: 0,
  };
}

function validateOnlyCanary(deps = {}) {
  return runCanary('VALIDATE_ONLY', deps);
}

function executeCanary(deps = {}) {
  return runCanary('EXECUTE_CANARY', deps);
}

module.exports = {
  runCanary,
  validateOnlyCanary,
  executeCanary,
  buildCanaryContext,
  blockedResult,
};
