const axios = require("axios");
const {
  APPROVAL_TOKEN,
  buildPausedReservationDraft,
  discoverInstagramReelAssets,
  META_API_VERSION,
} = require("./meta-paused-draft-next");
const {
  runtimeConfig,
  normalizeApiVersion,
  parseFutureStart,
  inspectAccountContext,
  validateScheduleForAccount,
} = require("./meta-runtime-preflight");
const { executePausedMetaDraftSafely } = require("./meta-safe-orchestrator");

const DEFAULT_REEL = "https://www.instagram.com/reel/C9M7_b6MayR/";
const DEFAULT_USERNAME = "parma.divinibenedetti";
const DEFAULT_LATITUDE = 52.499492;
const DEFAULT_LONGITUDE = 13.4399793;

function createRuntimeTransport({ accessToken, apiVersion = META_API_VERSION, client = axios }) {
  const http = client.create
    ? client.create({
        baseURL: `https://graph.facebook.com/${normalizeApiVersion(apiVersion)}`,
        timeout: 20000,
      })
    : client;

  return {
    async get(endpoint, params = {}) {
      const response = await http.get(endpoint, {
        params: { ...params, access_token: accessToken },
      });
      return response.data;
    },
    async post(endpoint, payload = {}) {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(payload)) {
        form.set(
          key,
          value && typeof value === "object" ? JSON.stringify(value) : String(value)
        );
      }
      form.set("access_token", accessToken);
      const response = await http.post(endpoint, form, {
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      return response.data;
    },
  };
}

async function collectPagedData(transport, endpoint, params = {}, maxPages = 20) {
  const data = [];
  let after = null;
  let pages = 0;
  let hasMore = false;

  do {
    const response = await transport.get(endpoint, {
      ...params,
      limit: 100,
      ...(after ? { after } : {}),
    });
    data.push(...(response?.data || []));
    pages += 1;
    const nextCursor = response?.paging?.cursors?.after || null;
    hasMore = Boolean(response?.paging?.next && nextCursor);
    after = hasMore ? nextCursor : null;
  } while (hasMore && pages < maxPages);

  return {
    data,
    pages,
    truncated: hasMore,
  };
}

async function inspectExistingDraft(transport, adAccountId, draft) {
  const campaigns = await collectPagedData(
    transport,
    `/${adAccountId}/campaigns`,
    { fields: "id,name,status,effective_status,objective" }
  );

  if (campaigns.truncated) {
    return { safe: false, blocker: "campaign_scan_truncated", existing: {} };
  }

  const duplicates = campaigns.data.filter(
    (campaign) => campaign?.name === draft.campaign.name
  );

  if (duplicates.length > 1) {
    return { safe: false, blocker: "multiple_matching_paused_drafts", existing: {} };
  }

  const duplicate = duplicates[0] || null;
  if (!duplicate) return { safe: true, blocker: null, existing: {} };

  if (
    duplicate.status !== "PAUSED" ||
    duplicate.objective !== draft.campaign.objective
  ) {
    return { safe: false, blocker: "matching_campaign_not_resumable", existing: {} };
  }

  const adsets = await transport.get(`/${duplicate.id}/adsets`, {
    fields: "id,status,effective_status",
    limit: 1,
  });
  if ((adsets?.data || []).length > 0) {
    return { safe: false, blocker: "matching_campaign_requires_manual_inspection", existing: {} };
  }

  return {
    safe: true,
    blocker: null,
    existing: { campaign_id: String(duplicate.id) },
  };
}

async function executeRuntimePausedDraft({
  env = process.env,
  startsAt,
  approvalToken,
  httpClient = axios,
} = {}) {
  const config = runtimeConfig(env);
  const killSwitch = env.META_PAUSED_DRAFT_KILL_SWITCH === "true";

  if (!config.writeGateEnabled) {
    return {
      success: false,
      blocked: true,
      reason: "write_gate_disabled",
      transport_used: false,
      activates_spend: false,
    };
  }
  if (approvalToken !== APPROVAL_TOKEN) {
    return {
      success: false,
      blocked: true,
      reason: "approval_token_invalid",
      transport_used: false,
      activates_spend: false,
    };
  }
  if (killSwitch) {
    return {
      success: false,
      blocked: true,
      reason: "kill_switch_enabled",
      transport_used: false,
      activates_spend: false,
    };
  }

  const missing = [];
  if (!config.accessToken) missing.push("META_ACCESS_TOKEN");
  if (!config.adAccountId) missing.push("META_AD_ACCOUNT_ID");
  if (!config.dsaBeneficiary) missing.push("META_AD_DSA_BENEFICIARY");
  if (!config.dsaPayor) missing.push("META_AD_DSA_PAYOR");
  if (missing.length) {
    return {
      success: false,
      blocked: true,
      reason: "configuration_incomplete",
      missing_variables: missing,
      transport_used: false,
      activates_spend: false,
    };
  }

  const start = parseFutureStart(startsAt);
  if (!start) {
    return {
      success: false,
      blocked: true,
      reason: "invalid_start_time",
      transport_used: false,
      activates_spend: false,
    };
  }

  const transport = createRuntimeTransport({
    accessToken: config.accessToken,
    apiVersion: config.apiVersion,
    client: httpClient,
  });
  const account = await inspectAccountContext(transport, config);
  const schedule = validateScheduleForAccount({
    start,
    durationDays: 14,
    account,
    businessTimezone: config.businessTimezone,
  });
  if (account.blockers.length || !schedule.safe) {
    return {
      success: false,
      blocked: true,
      reason: schedule.safe ? "account_context_blocked" : schedule.reason,
      blockers: [...account.blockers, ...(schedule.reason ? [schedule.reason] : [])],
      transport_used: true,
      activates_spend: false,
    };
  }

  const assets = await discoverInstagramReelAssets({
    transport,
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
    durationDays: 14,
    startsAt: start,
    dsaBeneficiary: config.dsaBeneficiary,
    dsaPayor: config.dsaPayor,
    accountTimezone: account.timezone_name,
    businessTimezone: config.businessTimezone,
  });

  const existingInspection = await inspectExistingDraft(
    transport,
    config.adAccountId,
    draft
  );
  if (!existingInspection.safe) {
    return {
      success: false,
      blocked: true,
      reason: existingInspection.blocker,
      transport_used: true,
      activates_spend: false,
    };
  }

  const result = await executePausedMetaDraftSafely({
    transport,
    adAccountId: config.adAccountId,
    draft,
    approvalToken,
    existing: existingInspection.existing,
    assets,
    writeGateEnabled: config.writeGateEnabled,
    killSwitch,
  });

  return {
    ...result,
    transport_used: true,
    activates_spend: false,
  };
}

function registerSafePausedDraftRoute(app, { authorized, env = process.env, httpClient = axios } = {}) {
  app.post("/tools/meta/reservation-draft/create", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

    if (typeof authorized === "function" && !authorized(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
      const result = await executeRuntimePausedDraft({
        env,
        startsAt: req.body?.starts_at,
        approvalToken: req.body?.approval_token,
        httpClient,
      });
      if (!result.success) {
        const clientBlockers = new Set([
          "write_gate_disabled",
          "approval_token_invalid",
          "kill_switch_enabled",
        ]);
        return res.status(clientBlockers.has(result.reason) ? 403 : 409).json({
          ...result,
          endpoint: "meta_safe_paused_draft_create",
          write_operation_performed: false,
          activates_spend: false,
        });
      }

      return res.status(201).json({
        success: true,
        endpoint: "meta_safe_paused_draft_create",
        mode: result.mode,
        created_object_count: Object.keys(result.created || {}).length,
        reused_object_count: Object.keys(result.reused || {}).length,
        all_objects_paused: Object.entries(result.verification || {}).every(
          ([name, object]) => name === "creative_id" || object?.status === "PAUSED"
        ),
        operation_key: result.operation_key,
        activates_spend: false,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        endpoint: "meta_safe_paused_draft_create",
        error: String(error?.message || error).slice(0, 180),
        write_operation_performed: false,
        activates_spend: false,
      });
    }
  });
}

module.exports = {
  createRuntimeTransport,
  collectPagedData,
  inspectExistingDraft,
  executeRuntimePausedDraft,
  registerSafePausedDraftRoute,
};
