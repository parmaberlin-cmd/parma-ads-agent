const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Meta issue runner delegates to read collector and emits compact output', () => {
  const source = fs.readFileSync('scripts/run-meta-issue-report.js', 'utf8');
  assert.match(source, /collectMetaShadowData/);
  assert.match(source, /campaign_counts/);
  assert.match(source, /issue_report/);
  assert.doesNotMatch(source, /axios|fetch\(|\.post\(|\.delete\(|createPaused|WRITE|APPROVAL|BUDGET|META_ACCESS_TOKEN|META_AD_ACCOUNT_ID|issue_diagnostics/);
  assert.match(source, /process\.exitCode = 1/);
});
