function issueText(issue = {}) {
  return `${issue.code || ''} ${issue.summary || ''} ${issue.message || ''}`.toLowerCase();
}

const KNOWN_ISSUE_CODES = Object.freeze({
  '2490455': { category:'account_or_billing', reason:'account_security_or_payment_restriction' },
});

function knownIssue(issue = {}) {
  return KNOWN_ISSUE_CODES[String(issue.code || '').trim()] || null;
}

function classifyIssue(issue = {}) {
  const known = knownIssue(issue);
  if (known) return known.category;
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

function issueReason(issue = {}) {
  return knownIssue(issue)?.reason || classifyIssue(issue);
}

function safeIssueCode(value) {
  if (value == null) return null;
  const code = String(value).trim();
  return /^[A-Za-z][A-Za-z0-9_.:-]{0,31}$/.test(code) || /^\d{1,9}$/.test(code) ? code : null;
}

function buildPropagationDiagnostic(rows = []) {
  const reasonLevels = {};
  const reasonObjects = {};
  for (const row of rows) {
    for (const issue of row.issues || []) {
      const reason = issueReason(issue);
      reasonLevels[reason] ||= new Set();
      reasonObjects[reason] ||= new Set();
      reasonLevels[reason].add(row.object_level);
      reasonObjects[reason].add(`${row.object_level}:${row.name || row.campaign_ref || 'unknown'}`);
    }
  }
  const patterns = Object.entries(reasonObjects).map(([reason, objects]) => ({
    reason,
    affected_objects: objects.size,
    object_levels: [...reasonLevels[reason]].sort(),
    multi_level_pattern: reasonLevels[reason].size >= 2,
    account_level_pattern_candidate: reason === 'account_security_or_payment_restriction' && reasonLevels[reason].size >= 2 && objects.size >= 2,
    cause_proven: false,
  })).sort((a, b) => b.affected_objects - a.affected_objects);
  return {
    patterns,
    account_level_pattern_candidate: patterns.some((p) => p.account_level_pattern_candidate),
    cause_proven: false,
    requires_human_account_ui: patterns.some((p) => p.account_level_pattern_candidate),
  };
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
  const issueReasons = {};
  const unknownCodes = {};
  let issueCount = 0;
  for (const row of rows) {
    for (const issue of row.issues) {
      issueCount += 1;
      const category = classifyIssue(issue);
      issueCategories[category] = (issueCategories[category] || 0) + 1;
      const reason = issueReason(issue);
      issueReasons[reason] = (issueReasons[reason] || 0) + 1;
      if (category === 'unknown') {
        const code = safeIssueCode(issue.code);
        if (code) unknownCodes[code] = (unknownCodes[code] || 0) + 1;
      }
    }
  }
  return {
    affected_objects: rows.length,
    issue_count: issueCount,
    categories,
    issue_categories: issueCategories,
    issue_reasons: issueReasons,
    unknown_codes: unknownCodes,
    propagation: buildPropagationDiagnostic(rows),
    objects: rows,
  };
}

module.exports = { KNOWN_ISSUE_CODES, classifyIssue, issueReason, safeIssueCode, buildPropagationDiagnostic, buildMetaIssueReport };
