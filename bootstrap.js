const { META_API_VERSION } = require("./meta-paused-draft-next");
if (!process.env.META_API_VERSION) process.env.META_API_VERSION = META_API_VERSION;

const legacyMetaOneShotRequested = Boolean(process.env.META_PAUSED_DRAFT_ONE_SHOT);
process.env.META_PAUSED_DRAFT_ONE_SHOT = "";

const realExpress = require("express");
const { collectFullLiveShadowInput } = require("./full-live-shadow-data");
const { buildShadowAgentReport } = require("./agent-shadow");
const { registerMetaRealPreflightRoute } = require("./meta-runtime-preflight");
const { registerMetaSafeCreateRoute } = require("./meta-safe-create-route");
const { buildSanitizedPromotionStatus } = require("./promotion-status");
const { buildReadonlyCycleState, assertReadonlyCycleSafe } = require("./shadow-readonly-cycle");
const { buildOperationalDashboard } = require("./operational-dashboard");
const { buildPublicSourceView } = require("./runtime-public-view");
const { safePublicJson } = require("./public-output-safety");
const {
  loadHistoryState,
  appendAndPersist,
  buildSanitizedHistoryRecord,
  publicHistorySummary,
  historyPath,
  historyStorageStatus,
} = require("./shadow-history-store");
const metaPreflightStatus = require("./meta-preflight-status");

const state = {
  status: "starting",
  started_at: new Date().toISOString(),
  finished_at: null,
  result: null,
  error: null,
  last_refresh_error: null,
  last_refresh_failed_at: null,
};

let refreshPromise = null;
const historyStorage = historyStorageStatus(process.env);
const initialHistory = loadHistoryState(historyPath(process.env));
let shadowHistory = initialHistory.records;
let historyIntegrity = {
  healthy: initialHistory.healthy === true,
  reason: initialHistory.reason || null,
};

function authorized(req) {
  const supplied = req.headers["x-api-key"] || String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  return Boolean(process.env.PARMA_AGENT_API_KEY && supplied === process.env.PARMA_AGENT_API_KEY);
}

function buildRuntimeViews() {
  if (!state.result) return { summary: null, cycle: null, dashboard: null };
  const r = state.result;
  const publicStorage = { ...historyStorage, ...historyIntegrity };
  const promotion = buildSanitizedPromotionStatus({
    shadowResult: { ...r, refresh_error: state.last_refresh_error },
    metaPreflightState: metaPreflightStatus.state,
    buildValidated: process.env.AGENT_BUILD_VALIDATED === "true",
    shadowRecords: shadowHistory,
    historyDurable: historyStorage.durable,
    historyHealthy: historyIntegrity.healthy,
  });
  const publicSources = buildPublicSourceView(r.live_sources || {});
  const summary = {
    generated_at: r.generated_at,
    mode: "shadow",
    writes_allowed: false,
    data_quality: {
      confidence: r.data_quality?.confidence || "unknown",
      channel_ready: r.data_quality?.channel_ready || {},
      blockers: r.data_quality?.blockers || [],
      integrity_ok: r.data_quality?.integrity_ok === true,
    },
    ...publicSources,
    funnel: {
      rates: r.live_sources?.ga4?.funnel?.rates || {
        page_to_start: null,
        start_to_booking: null,
        page_to_booking: null,
      },
      configuration_complete: r.live_sources?.ga4?.funnel?.completeness?.configuration_complete === true,
      observation_complete: r.live_sources?.ga4?.funnel?.completeness?.observation_complete === true,
    },
    conversion_integrity: {
      status: r.conversion_integrity?.status || "unknown",
      confidence: r.conversion_integrity?.confidence || "unknown",
      optimization_allowed: Boolean(r.conversion_integrity?.optimization_allowed),
      issues: r.conversion_integrity?.issues || [],
    },
    history: publicHistorySummary(shadowHistory, publicStorage),
    promotion,
    anomalies: (r.anomalies || []).map((a) => ({
      code: a.code,
      severity: a.severity,
      reason: a.reason,
      channel: a.channel,
    })),
    primary_priorities: (r.daily_manager?.primary_priorities || []).map((p) => ({
      code: p.code,
      severity: p.severity,
      source: p.source,
      reason: p.reason,
      requires_authorization: Boolean(p.requires_authorization),
    })),
  };
  const cycle = buildReadonlyCycleState({
    snapshot: { now: r.generated_at, data_quality: r.data_quality, live_sources: r.live_sources },
    report: { conversion_integrity: r.conversion_integrity, anomalies: r.anomalies, daily_manager: r.daily_manager, mode: "shadow" },
    history: shadowHistory,
  });
  assertReadonlyCycleSafe(cycle);
  const dashboard = buildOperationalDashboard({ summary, cycle, promotion });
  return { summary, cycle, dashboard };
}

function sanitizedSummary() {
  return buildRuntimeViews().summary;
}

function triggerShadowReport() {
  if (refreshPromise) return refreshPromise;
  const hadPreviousResult = Boolean(state.result);
  state.status = "starting";
  state.started_at = new Date().toISOString();
  state.finished_at = null;
  state.error = null;

  refreshPromise = collectFullLiveShadowInput({ days: Number(process.env.SHADOW_REPORT_DAYS || 30) })
    .then((input) => {
      const report = buildShadowAgentReport(input);
      state.status = "completed";
      state.finished_at = new Date().toISOString();
      state.error = null;
      state.last_refresh_error = null;
      state.last_refresh_failed_at = null;
      state.result = {
        generated_at: state.finished_at,
        data_quality: input.data_quality,
        live_sources: input.live_sources,
        conversions: input.conversions,
        conversion_integrity: report.conversion_integrity,
        anomalies: report.anomalies,
        daily_manager: report.daily_manager,
        budget_recommendations: report.budget_recommendations,
        channel_roles: report.channel_roles,
        business_value: report.business_value,
        journal: report.journal,
      };

      const record = buildSanitizedHistoryRecord({ snapshot: input, report, generatedAt: state.finished_at });
      try {
        shadowHistory = appendAndPersist({ records: shadowHistory, record, filePath: historyPath(process.env) });
        historyIntegrity = { healthy: true, reason: null };
      } catch (error) {
        historyIntegrity = { healthy: false, reason: "history_persist_failed" };
        console.error(JSON.stringify({ event: "shadow_history_persist", success: false, error: "shadow_history_persist_failed", writes_allowed: false }));
      }

      const cycle = buildRuntimeViews().cycle;
      console.log(JSON.stringify({
        event: "agent_shadow_live_report",
        success: true,
        generated_at: state.finished_at,
        source_health: {
          google: Boolean(input.access?.google_ok),
          ga4: Boolean(input.access?.ga4_ok),
          meta: Boolean(input.access?.meta_ok),
        },
        data_confidence: input.data_quality?.confidence || null,
        conversion_integrity: report.conversion_integrity?.status || null,
        priority_count: report.daily_manager?.primary_priorities?.length || 0,
        history_runs: shadowHistory.length,
        history_durable: historyStorage.durable,
        history_healthy: historyIntegrity.healthy,
        cycle_blocked_stages: cycle?.blocked_stages || [],
        writes_allowed: false,
      }));
      return state.result;
    })
    .catch((error) => {
      const failedAt = new Date().toISOString();
      const errorMessage = String(error?.message || error);
      state.finished_at = failedAt;
      state.last_refresh_error = errorMessage;
      state.last_refresh_failed_at = failedAt;
      if (hadPreviousResult && state.result) {
        state.status = "completed";
        state.error = null;
      } else {
        state.status = "failed";
        state.error = "shadow_report_failed";
      }
      console.error(JSON.stringify({ event: "agent_shadow_live_report", success: false, error: "shadow_report_failed", stale_result_preserved: Boolean(hadPreviousResult && state.result), writes_allowed: false }));
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function wrappedExpress(...args) {
  const app = realExpress(...args);
  registerMetaRealPreflightRoute(app, { authorized });
  registerMetaSafeCreateRoute(app, { authorized });
  metaPreflightStatus.register(app);

  app.get("/health/agent-shadow-summary", (req, res) => {
    if (state.status === "starting" && !state.result) {
      return safePublicJson(res.status(202), { success: true, status: "running", mode: "shadow", writes_allowed: false, started_at: state.started_at });
    }
    if (state.status === "failed" && !state.result) {
      return safePublicJson(res.status(500), { success: false, status: "failed", mode: "shadow", writes_allowed: false, error: "shadow_report_failed" });
    }
    return safePublicJson(res, {
      success: true,
      status: "completed",
      refreshing: Boolean(refreshPromise),
      refresh_failed: Boolean(state.last_refresh_error),
      last_refresh_failed_at: state.last_refresh_failed_at,
      ...buildRuntimeViews().summary,
    });
  });

  app.get("/health/agent-dashboard", (req, res) => {
    if (state.status === "starting" && !state.result) return safePublicJson(res.status(202), { success:true, status:"running", mode:"shadow", writes_allowed:false });
    if (!state.result) return safePublicJson(res.status(500), { success:false, status:"unavailable", mode:"shadow", writes_allowed:false });
    return safePublicJson(res, { success:true, ...buildRuntimeViews().dashboard });
  });

  app.get("/health/agent-cycle", (req, res) => {
    if (state.status === "starting" && !state.result) return safePublicJson(res.status(202), { success:true, status:"running", mode:"shadow", writes_allowed:false });
    if (!state.result) return safePublicJson(res.status(500), { success:false, status:"unavailable", mode:"shadow", writes_allowed:false });
    return safePublicJson(res, { success:true, ...buildRuntimeViews().cycle });
  });

  app.get("/tools/agent/shadow/live", (req, res) => {
    if (!authorized(req)) return res.status(401).json({ success:false, error:"Unauthorized" });
    if (state.status === "starting" && !state.result) return res.status(202).json({ success:true, mode:"shadow", status:"running", writes_allowed:false, started_at:state.started_at });
    if (state.status === "failed" && !state.result) return res.status(500).json({ success:false, mode:"shadow", status:"failed", writes_allowed:false, started_at:state.started_at, finished_at:state.finished_at, error:state.error });
    return res.json({ success:true, mode:"shadow", status:refreshPromise?"refreshing":"completed", writes_allowed:false, started_at:state.started_at, finished_at:state.finished_at, refresh_error:state.last_refresh_error, last_refresh_failed_at:state.last_refresh_failed_at, ...state.result });
  });

  app.post("/tools/agent/shadow/refresh", (req, res) => {
    if (!authorized(req)) return res.status(401).json({ success:false, error:"Unauthorized" });
    const alreadyRunning = Boolean(refreshPromise);
    if (!alreadyRunning) triggerShadowReport().catch(() => {});
    return res.status(202).json({ success:true, mode:"shadow", status:alreadyRunning?"already_running":"started", writes_allowed:false, started_at:state.started_at });
  });

  return app;
}
Object.assign(wrappedExpress, realExpress);
require.cache[require.resolve("express")].exports = wrappedExpress;

if (legacyMetaOneShotRequested) {
  console.warn(JSON.stringify({ event:"meta_legacy_one_shot_disabled", reason:"central_safe_route_required", activates_spend:false }));
}

triggerShadowReport().catch(() => {});
metaPreflightStatus.run().catch(() => {});
require("./server");