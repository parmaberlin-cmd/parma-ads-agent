require('dotenv').config();
const { collectMetaShadowData } = require('../live-shadow-data');

(async () => {
  const result = await collectMetaShadowData();
  if (!result.access_ok) {
    console.error(JSON.stringify({ access_ok: false, error: result.error || 'meta_read_failed' }));
    process.exitCode = 1;
    return;
  }
  const overview = result.overview || {};
  console.log(JSON.stringify({
    access_ok: true,
    collected_at: result.collected_at,
    campaign_counts: overview.campaign_counts || {},
    issue_report: overview.issue_report || { affected_objects: 0, categories: {}, objects: [] },
  }, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({ access_ok: false, error: String(error?.message || 'meta_issue_report_failed').slice(0, 180) }));
  process.exitCode = 1;
});
