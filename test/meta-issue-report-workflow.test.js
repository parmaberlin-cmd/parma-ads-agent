const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Meta issue workflow is manual and read-only', () => {
  const workflow = fs.readFileSync('.github/workflows/meta-issue-report.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:|pull_request:|schedule:|repository_dispatch:/);
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]), ['META_ACCESS_TOKEN','META_AD_ACCOUNT_ID','META_API_VERSION']);
  assert.doesNotMatch(workflow, /WRITE_GATE|APPROVAL|BUDGET|ACTIVE|PAUSED|upload-artifact|GITHUB_OUTPUT|GITHUB_STEP_SUMMARY|permissions:/);
  assert.deepEqual([...workflow.matchAll(/^\s+-?\s*run:\s*(.+)$/gm)].map(m => m[1].trim()), ['npm ci','node scripts/run-meta-issue-report.js']);
});
