const realExpress = require("express");
const { collectFullLiveShadowInput } = require("./full-live-shadow-data");
const { buildShadowAgentReport } = require("./agent-shadow");

const state = {
  status: "starting",
  started_at: new Date().toISOString(),
  finished_at: null,
  result: null,
  error: null,
};

function authorized(req) {
  const supplied = req.headers["x-api-key"] || String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  return Boolean(process.env.PARMA_AGENT_API_KEY && supplied === process.env.PARMA_AGENT_API_KEY);
}

function sanitizedSummary() {
  if (state.status !== "completed" || !state.result) return null;
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

function wrappedExpress(...args) {
  const app = realExpress(...args);
  app.get("/health/agent-shadow-summary", (req, res) => {
    if (state.status === "starting") return res.status(202).json({ success: true, status: "running", mode: "shadow", writes_allowed: false });
    if (state.status === "failed") return res.status(500).json({ success: false, status: "failed", mode: "shadow", writes_allowed: false, error: String(state.error || "shadow_report_failed").slice(0, 160) });
    return res.json({ success: true, status: "completed", ...sanitizedSummary() });
  });
  app.get("/tools/agent/shadow/live", (req, res) => {
    if (!authorized(req)) return res.status(401).json({ success: false, error: "Unauthorized" });
    if (state.status === "starting") return res.status(202).json({ success: true, mode: "shadow", status: "running", writes_allowed: false, started_at: state.started_at });
    if (state.status === "failed") return res.status(500).json({ success: false, mode: "shadow", status: "failed", writes_allowed: false, started_at: state.started_at, finished_at: state.finished_at, error: state.error });
    return res.json({ success: true, mode: "shadow", status: "completed", writes_allowed: false, started_at: state.started_at, finished_at: state.finished_at, ...state.result });
  });
  return app;
}
Object.assign(wrappedExpress, realExpress);
require.cache[require.resolve("express")].exports = wrappedExpress;

collectFullLiveShadowInput({ days: Number(process.env.SHADOW_REPORT_DAYS || 30) })
  .then((input) => {
    const report = buildShadowAgentReport(input);
    state.status = "completed";
    state.finished_at = new Date().toISOString();
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
  })
  .catch((error) => {
    state.status = "failed";
    state.finished_at = new Date().toISOString();
    state.error = String(error?.message || error);
    console.error(JSON.stringify({ event: "agent_shadow_live_report", success: false, error: state.error, writes_allowed: false }));
  });

require("./server");
