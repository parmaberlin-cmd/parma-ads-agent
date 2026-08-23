const axios = require('axios');
const {
  APPROVAL_TOKEN,
  buildPausedReservationDraft,
  discoverInstagramReelAssets,
  META_API_VERSION,
} = require('./meta-paused-draft-next');
const {
  runtimeConfig,
  parseFutureStart,
  inspectAccountContext,
  validateScheduleForAccount,
  createReadTransport,
  normalizeApiVersion,
} = require('./meta-runtime-preflight');
const { inspectNamedDraftChain } = require('./meta-real-preflight');
const { executePausedMetaDraftSafely } = require('./meta-safe-orchestrator');
const { AUTONOMY_LEVELS, stableKey } = require('./safe-execution');

const DEFAULT_REEL = 'https://www.instagram.com/reel/C9M7_b6MayR/';
const DEFAULT_USERNAME = 'parma.divinibenedetti';
const DEFAULT_LATITUDE = 52.499492;
const DEFAULT_LONGITUDE = 13.4399793;
const inFlightOperations = new Set();

function createWriteTransport({ accessToken, apiVersion = META_API_VERSION, client = axios }) {
  const normalized = normalizeApiVersion(apiVersion);
  const http = client.create
    ? client.create({ baseURL: `https://graph.facebook.com/${normalized}`, timeout: 20000 })
    : client;
  return {
    async get(endpoint, params = {}) {
      const response = await http.get(endpoint, { params: { ...params, access_token: accessToken } });
      return response.data;
    },
    async post(endpoint, payload = {}) {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(payload)) {
        body.set(key, value && typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
      body.set('access_token', accessToken);
      const response = await http.post(endpoint, body, {
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      return response.data;
    },
  };
}

function operationKey({ env = process.env, startsAt } = {}) {
  const config = runtimeConfig(env);
  const normalizedStart = parseFutureStart(startsAt) || String(startsAt || '').trim();
  return stableKey({
    ad_account: config.adAccountId || 'unknown',
    starts_at: normalizedStart,
    operation: 'paused_reservation_draft',
  });
}

function acquireOperationLock(key) {
  if (!key || inFlightOperations.has(key)) return false;
  inFlightOperations.add(key);
  return true;
}

function releaseOperationLock(key) {
  inFlightOperations.delete(key);
}

async function prepareSafeCreateContext({ env = process.env, startsAt, httpClient = axios } = {}) {
  const config = runtimeConfig(env);
  const missing = [];
  if (!config.accessToken) missing.push('META_ACCESS_TOKEN');
  if (!config.adAccountId) missing.push('META_AD_ACCOUNT_ID');
  if (!config.dsaBeneficiary) missing.push('META_AD_DSA_BENEFICIARY');
  if (!config.dsaPayor) missing.push('META_AD_DSA_PAYOR');
  if (missing.length) return { ready: false, blockers: ['configuration_incomplete'], missing_variables: missing };
  if (!config.writeGateEnabled) return { ready: false, blockers: ['server_write_gate_disabled'] };

  const start = parseFutureStart(startsAt);
  if (!start) return { ready: false, blockers: ['invalid_start_time'] };

  const readTransport = createReadTransport({ accessToken: config.accessToken, apiVersion: config.apiVersion, client: httpClient });
  const account = await inspectAccountContext(readTransport, config);
  const durationDays = 14;
  const schedule = validateScheduleForAccount({ start, durationDays, account, businessTimezone: config.businessTimezone });
  if (!schedule.safe) return { ready: false, blockers: [...new Set([...(account.blockers || []), schedule.reason || 'schedule_conversion_failed'])], account };

  const assets = await discoverInstagramReelAssets({
    transport: readTransport,
    adAccountId: config.adAccountId,
    instagramUsername: DEFAULT_USERNAME,
    reelPermalink: DEFAULT_REEL,
  });
  const draft = buildPausedReservationDraft({
    pageId: assets.page_id,
    instagramUserId: assets.instagram_user_id,
    sourceInstagramMediaId: assets.source_instagram_media_id,
    latitude: DEFAULT_LATITUDE,
    longitude: DEFAULT_LONGITUDE,
    dailyBudgetEur: 6,
    durationDays,
    startsAt: start,
    dsaBeneficiary: config.dsaBeneficiary,
    dsaPayor: config.dsaPayor,
    accountTimezone: account.timezone_name,
    businessTimezone: config.businessTimezone,
  });
  const chain = await inspectNamedDraftChain({ transport: readTransport, adAccountId: config.adAccountId, draft });
  if (!chain.safe) return { ready: false, blockers: chain.blockers || ['existing_chain_not_safe'], account, chain };

  return {
    ready: true,
    blockers: [],
    config,
    account,
    assets,
    draft,
    knownPartial: chain.knownPartial || {},
    writeTransport: createWriteTransport({ accessToken: config.accessToken, apiVersion: config.apiVersion, client: httpClient }),
  };
}

function sanitizeCreateResult(result = {}) {
  return {
    success: result.success === true,
    blocked: result.blocked === true,
    reason: result.reason || null,
    mode: 'paused_draft_only',
    operation_key: result.operation_key || null,
    reused: result.reused || {},
    created_stages: Object.keys(result.created || {}).map((key) => key.replace(/_id$/, '')),
    verification: Object.fromEntries(Object.entries(result.verification || {}).map(([key, value]) => [key.replace(/_id$/, ''), { status: value.status, effective_status: value.effective_status }])),
    activates_spend: false,
    may_activate: false,
    may_spend: false,
  };
}

function registerMetaSafeCreateRoute(app, { authorized, env = process.env, httpClient = axios } = {}) {
  app.post('/tools/meta/reservation-draft/create', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (typeof authorized === 'function' && !authorized(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (req.body?.confirmation !== APPROVAL_TOKEN) return res.status(400).json({ success: false, error: 'Exact paused-draft approval token is required', activates_spend: false });
    if (env.PARMA_AGENT_KILL_SWITCH === 'true') return res.status(423).json({ success: false, blocked: true, reason: 'kill_switch_enabled', activates_spend: false });

    const lockKey = operationKey({ env, startsAt: req.body?.starts_at });
    if (!acquireOperationLock(lockKey)) {
      return res.status(409).json({
        success: false,
        blocked: true,
        reason: 'duplicate_operation_in_flight',
        activates_spend: false,
        may_activate: false,
        may_spend: false,
      });
    }

    try {
      const prepared = await prepareSafeCreateContext({ env, startsAt: req.body?.starts_at, httpClient });
      if (!prepared.ready) return res.status(409).json({ success: false, blocked: true, blockers: prepared.blockers, activates_spend: false, may_activate: false, may_spend: false });
      const result = await executePausedMetaDraftSafely({
        transport: prepared.writeTransport,
        adAccountId: prepared.config.adAccountId,
        draft: prepared.draft,
        approvalToken: req.body.confirmation,
        existing: prepared.knownPartial,
        assets: prepared.assets,
        writeGateEnabled: prepared.config.writeGateEnabled,
        killSwitch: false,
        autonomyLevel: AUTONOMY_LEVELS.SAFE_WRITE,
      });
      return res.status(result.success ? 201 : 409).json(sanitizeCreateResult(result));
    } catch (error) {
      const graph = error?.cause?.response?.data?.error || error?.response?.data?.error || {};
      return res.status(502).json({
        success: false,
        blocked: true,
        stage: error?.stage || null,
        error: {
          message: String(graph.message || error?.cause?.message || error?.message || 'meta_safe_create_failed').replace(/\b\d{8,}\b/g, '[REDACTED_ID]').slice(0, 180),
          type: graph.type || null,
          code: graph.code || null,
          subcode: graph.error_subcode || null,
        },
        activates_spend: false,
        may_activate: false,
        may_spend: false,
      });
    } finally {
      releaseOperationLock(lockKey);
    }
  });
}

module.exports = {
  createWriteTransport,
  operationKey,
  acquireOperationLock,
  releaseOperationLock,
  prepareSafeCreateContext,
  sanitizeCreateResult,
  registerMetaSafeCreateRoute,
};
