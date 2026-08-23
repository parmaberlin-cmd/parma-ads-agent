const token = process.env.META_ACCESS_TOKEN;
const rawAccount = String(process.env.META_AD_ACCOUNT_ID || '');
const account = rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`;
const candidateVersion = String(process.env.META_API_VERSION || 'v19.0');
const version = /^v\d+\.0$/.test(candidateVersion) ? candidateVersion : 'v19.0';

function clean(value, max) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').slice(0, max);
}
function issues(items) {
  return (Array.isArray(items) ? items : []).slice(0, 20).map(x => ({
    level: clean(x.level, 40),
    code: x.error_code ?? null,
    summary: clean(x.error_summary || 'meta_delivery_issue', 180),
    message: clean(x.error_message, 300),
  }));
}
async function getCollection(path, fields) {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', '100');
  url.searchParams.set('access_token', token);
  const response = await fetch(url, { method: 'GET' });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(clean(body?.error?.message || `meta_http_${response.status}`, 180));
  return body.data || [];
}

(async () => {
  if (!token || !rawAccount) throw new Error('meta_configuration_incomplete');
  const [campaigns, adsets, ads] = await Promise.all([
    getCollection(`${account}/campaigns`, 'id,name,status,effective_status,issues_info'),
    getCollection(`${account}/adsets`, 'id,name,campaign_id,status,effective_status,issues_info'),
    getCollection(`${account}/ads`, 'id,name,adset_id,campaign_id,status,effective_status,issues_info'),
  ]);
  const rows = [
    ...campaigns.map(x => ({ type: 'campaign', ...x })),
    ...adsets.map(x => ({ type: 'adset', ...x })),
    ...ads.map(x => ({ type: 'ad', ...x })),
  ].filter(x => x.effective_status === 'WITH_ISSUES' || (Array.isArray(x.issues_info) && x.issues_info.length));
  const objects = rows.map(x => ({
    type: x.type,
    id: String(x.id || ''),
    name: clean(x.name, 120),
    campaign_id: x.campaign_id ? String(x.campaign_id) : null,
    adset_id: x.adset_id ? String(x.adset_id) : null,
    status: clean(x.status, 40),
    effective_status: clean(x.effective_status, 40),
    issues: issues(x.issues_info),
  }));
  const categories = {};
  for (const object of objects) for (const issue of object.issues) {
    const key = issue.summary || 'meta_delivery_issue';
    categories[key] = (categories[key] || 0) + 1;
  }
  console.log(JSON.stringify({
    access_ok: true,
    collected_at: new Date().toISOString(),
    campaign_counts: { total: campaigns.length, with_issues: campaigns.filter(x => x.effective_status === 'WITH_ISSUES').length },
    issue_report: { affected_objects: objects.length, categories, objects },
  }, null, 2));
})().catch(error => {
  console.error(JSON.stringify({ access_ok: false, error: clean(error?.message || 'meta_issue_report_failed', 180) }));
  process.exitCode = 1;
});
