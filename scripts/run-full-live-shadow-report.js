const { collectFullLiveShadowInput } = require("../full-live-shadow-data");
const { buildShadowAgentReport } = require("../agent-shadow");

(async () => {
  const input = await collectFullLiveShadowInput({ days: Number(process.env.SHADOW_REPORT_DAYS || 30) });
  const report = buildShadowAgentReport(input);
  const output = {
    generated_at: new Date().toISOString(),
    mode: report.mode,
    writes_allowed: report.writes_allowed,
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
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
})().catch((error) => {
  console.error(JSON.stringify({ success: false, mode: "shadow", writes_allowed: false, error: error?.message || "full_live_shadow_report_failed" }));
  process.exitCode = 1;
});
