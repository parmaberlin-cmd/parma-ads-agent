const { collectFullLiveShadowInput } = require("../full-live-shadow-data");
const { buildShadowAgentReport } = require("../agent-shadow");
const { buildDashboardModel } = require("../dashboard-model");

(async () => {
  const input = await collectFullLiveShadowInput({ days: Number(process.env.SHADOW_REPORT_DAYS || 30) });
  const report = buildShadowAgentReport(input);
  const dashboard = buildDashboardModel({ input, report });
  const output = {
    generated_at: new Date().toISOString(), mode: report.mode, writes_allowed: report.writes_allowed, dashboard,
    live_sources: input.live_sources, conversions: input.conversions, conversion_integrity: report.conversion_integrity,
    funnel: report.funnel, trend_analysis: report.trend_analysis, waste: report.waste, opportunities: report.opportunities,
    match_type_analysis: report.match_type_analysis, rsa_analysis: report.rsa_analysis, landing_continuity: report.landing_continuity,
    safety_gate: report.safety_gate, executive: report.executive, anomalies: report.anomalies, daily_manager: report.daily_manager,
    budget_recommendations: report.budget_recommendations, budget_simulation: report.budget_simulation,
    channel_roles: report.channel_roles, business_value: report.business_value, journal: report.journal,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
})().catch((error) => {
  console.error(JSON.stringify({ success: false, mode: "shadow", writes_allowed: false, error: error?.message || "full_live_shadow_report_failed" }));
  process.exitCode = 1;
});
