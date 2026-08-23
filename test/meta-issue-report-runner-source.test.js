const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic runner outputs only status counts and issue report',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/campaign_counts/);
 assert.match(source,/issue_report/);
 assert.doesNotMatch(source,/process\.env\.META_ACCESS_TOKEN/);
});
