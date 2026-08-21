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

function wrappedExpress(...args) {
  const app = realExpress(...args);
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
