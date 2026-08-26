const { collectMetaShadowData } = require("../live-shadow-data");

(async () => {
  const result = await collectMetaShadowData();
  if (!result.access_ok) {
    throw new Error(String(result.error || "meta_issue_report_failed").slice(0, 180));
  }

  const overview = result.overview || {};
  const issueReport = overview.issue_report || {};
  console.log(JSON.stringify({
    access_ok: true,
    collected_at: result.collected_at || new Date().toISOString(),
    campaign_counts: overview.campaign_counts || {},
    issue_report: {
      affected_objects: Number(issueReport.affected_objects || 0),
      issue_count: Number(issueReport.issue_count || 0),
      categories: issueReport.issue_categories || issueReport.categories || {},
      reasons: issueReport.issue_reasons || {},
      unknown_codes: issueReport.unknown_codes || {},
    },
    writes_allowed: false,
  }, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({
    access_ok: false,
    error: String(error?.message || "meta_issue_report_failed").replace(/[\r\n\t]+/g, " ").slice(0, 180),
    writes_allowed: false,
  }));
  process.exitCode = 1;
});
