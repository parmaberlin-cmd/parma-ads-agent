const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic runner does not explicitly emit credentials or raw diagnostic tree',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(source,/META_ACCESS_TOKEN|META_AD_ACCOUNT_ID|issue_diagnostics|access_token/);
 assert.match(source,/campaign_counts/);
 assert.match(source,/issue_report/);
});
