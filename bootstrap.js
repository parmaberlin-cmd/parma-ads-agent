const realExpress = require("express");
const { collectFullLiveShadowInput } = require("./full-live-shadow-data");
const { buildShadowAgentReport } = require("./agent-shadow");
const { registerMetaRealPreflightRoute } = require("./meta-runtime-preflight");
const { registerSafePausedDraftRoute } = require("./meta-safe-runtime-write");
const metaPreflightStatus = require("./meta-preflight-status");

const legacyOneShotRequested = Boolean(process.env.META_PAUSED_DRAFT_ONE_SHOT);
process.env.META_PAUSED_DRAFT_ONE_SHOT = "";

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

function authorized(req) {
  const supplied = req.headers["x-api-key"] || String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  return Boolean(process.env.PARMA_AGENT_API_KEY && supplied === process.env.PARMA_AGENT_API_KEY);
}

function sanitizedSummary() {
  if (!state.result) return null;
  const r = state.result;
  return {
    generated_at: r.generated_at,
    mode: "shadow",
    writes_allowed: false,
    source_health: {
      google: Boolean(r.live_sources?.google?.access_ok),
      ga4: Boolean(r.live_sources?.ga4?.access_ok),
      meta: Boolean(r.live_sources?.meta?.access_ok),
    },
    source_errors: {
      google: r.live_sources?.google?.access_ok ? null : String(r.live_sources?.google?.error || "unavailable").slice(0, 160),
      ga4: r.live_sources?.ga4?.access_ok ? null : String(r.live_sources?.ga4?.error || "unavailable").slice(0, 160),
      meta: r.live_sources?.meta?.access_ok ? null : String(r.live_sources?.meta?.error || "unavailable").slice(0, 160),
    },
    source_diagnostics: {
      google: r.live_sources?.google?.diagnostic || null,
      ga4: r.live_sources?.ga4?.access_ok ? null : {
        configuration_complete: Boolean(r.live_sources?.ga4?.configuration_complete),
        required_variable: r.live_sources?.ga4?.required_variable || null,
      },
      meta: r.live_sources?.meta?.access_ok ? {
        campaign_counts: r.live_sources?.meta?.overview?.campaign_counts || {},
      } : null,
    },
    conversion_integrity: {
      status: r.conversion_integrity?.status || "unknown",
      confidence: r.conversion_integrity?.confidence || "unknown",
      optimization_allowed: Boolean(r.conversion_integrity?.optimization_allowed),
      issues: r.conversion_integrity?.issues || [],
    },
    anomalies: (r.anomalies || []).map((a) => ({ code: a.code, severity: a.severity, reason: a.reason, channel: a.channel })),
    primary_priorities: (r.daily_manager?.primary_priorities || []).map((p) => ({ code: p.code, severity: p.severity, source: p.source, reason: p.reason, requires_authorization: Boolean(p.requires_authorization) })),
  };
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
      console.log(JSON.stringify({
        event: "agent_shadow_live_report",
        success: true,
        generated_at: state.finished_at,
        source_health: {
          google: Boolean(input.access?.google_ok),
          ga4: Boolean(input.access?.ga4_ok),
          meta: Boolean(input.access?.meta_ok),
        },
        conversion_integrity: report.conversion_integrity?.status || null,
        priority_count: report.daily_manager?.primary_priorities?.length || 0,
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
        state.error = errorMessage;
      }
      console.error(JSON.stringify({ event: "agent_shadow_live_report", success: false, error: errorMessage, stale_result_preserved: Boolean(hadPreviousResult && state.result), writes_allowed: false }));
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
  registerSafePausedDraftRoute(app, { authorized });
  metaPreflightStatus.register(app);
  app.get("/health/agent-shadow-summary", (req, res) => {
    if (state.status === "starting" && !state.result) return res.status(202).json({ success: true, status: "running", mode: "shadow", writes_allowed: false, started_at: state.started_at });
    if (state.status === "failed" && !state.result) return res.status(500).json({ success: false, status: "failed", mode: "shadow", writes_allowed: false, error: String(state.error || "shadow_report_failed").slice(0, 160) });
    return res.json({ success: true, status: refreshPromise ? "refreshing" : "completed", refresh_error: state.last_refresh_error ? String(state.last_refresh_error).slice(0, 160) : null, last_refresh_failed_at: state.last_refresh_failed_at, ...sanitizedSummary() });
  });
  app.get("/tools/agent/shadow/live", (req, res) => {
    if (!authorized(req)) return res.status(401).json({ success: false, error: "Unauthorized" });
    if (state.status === "starting" && !state.result) return res.status(202).json({ success: true, mode: "shadow", status: "running", writes_allowed: false, started_at: state.started_at });
    if (state.status === "failed" && !state.result) return res.status(500).json({ success: false, mode: "shadow", status: "failed", writes_allowed: false, started_at: state.started_at, finished_at: state.finished_at, error: state.error });
    return res.json({ success: true, mode: "shadow", status: refreshPromise ? "refreshing" : "completed", writes_allowed: false, started_at: state.started_at, finished_at: state.finished_at, refresh_error: state.last_refresh_error, last_refresh_failed_at: state.last_refresh_failed_at, ...state.result });
  });
  app.post("/tools/agent/shadow/refresh", (req, res) => {
    if (!authorized(req)) return res.status(401).json({ success: false, error: "Unauthorized" });
    const alreadyRunning = Boolean(refreshPromise);
    if (!alreadyRunning) {
      triggerShadowReport().catch(() => {});
    }
    return res.status(202).json({
      success: true,
      mode: "shadow",
      status: alreadyRunning ? "already_running" : "started",
      writes_allowed: false,
      started_at: state.started_at,
    });
  });
  return app;
}
Object.assign(wrappedExpress, realExpress);
require.cache[require.resolve("express")].exports = wrappedExpress;

if (legacyOneShotRequested) {
  console.warn(JSON.stringify({
    event: "meta_legacy_one_shot_disabled",
    reason: "central_safe_orchestrator_required",
    activates_spend: false,
  }));
}

triggerShadowReport().catch(() => {});
metaPreflightStatus.run().catch(() => {});

require("./server");
