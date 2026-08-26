function issueText(issue = {}) {
  return `${issue.code || ''} ${issue.summary || ''} ${issue.message || ''}`.toLowerCase();
}

function classifyIssue(issue = {}) {
  const text = issueText(issue);
  if (/payment|billing|spend limit|account disabled|account status/.test(text)) return 'account_or_billing';
  if (/permission|access|instagram account|page|asset/.test(text)) return 'asset_or_permission';
  if (/creative|media|video|image|reel|instagram post/.test(text)) return 'creative_or_media';
  if (/policy|rejected|disapproved|review|restricted/.test(text)) return 'policy_or_review';
  if (/audience|target|geo|location|placement/.test(text)) return 'targeting_or_placement';
  if (/budget|bid|optimization|billing event|objective/.test(text)) return 'delivery_configuration';
  if (/schedule|start time|end time|date/.test(text)) return 'schedule';
  return 'unknown';
}

function safeIssueCode(value) {
  if (value == null) return null;
  const code = String(value).trim();
  return /^[A-Za-z][A-Za-z0-9_.:-]{0,31}$/.test(code) || /^\d{1,9}$/.test(code) ? code : null;
}

function buildMetaIssueReport(issueDiagnostics = {}) {
  const rows = [];
  for (const level of ['campaigns', 'adsets', 'ads']) {
    for (const object of issueDiagnostics[level] || []) {
      const issues = object.issues || [];
      rows.push({
        object_level: level === 'campaigns' ? 'campaign' : level === 'adsets' ? 'adset' : 'ad',
        name: object.name || null,
        campaign_ref: object.campaign_id || (level === 'campaigns' ? object.id : null),
        issue_count: issues.length,
        categories: [...new Set(issues.map(classifyIssue))],
        issues,
      });
    }
  }
  const categories = rows.reduce((acc, row) => {
    for (const category of row.categories) acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const issueCategories = {};
  const unknownCodes = {};
  let issueCount = 0;
  for (const row of rows) {
    for (const issue of row.issues) {
      issueCount += 1;
      const category = classifyIssue(issue);
      issueCategories[category] = (issueCategories[category] || 0) + 1;
      if (category === 'unknown') {
        const code = safeIssueCode(issue.code);
        if (code) unknownCodes[code] = (unknownCodes[code] || 0) + 1;
      }
    }
  }
  return {
    affected_objects: rows.length,
    issue_count: issueCount,
    // Legacy object-level counts retained for compatibility.
    categories,
    issue_categories: issueCategories,
    unknown_codes: unknownCodes,
    objects: rows,
  };
}

module.exports = { classifyIssue, safeIssueCode, buildMetaIssueReport };
