const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner selects compact fields rather than outputting full overview',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(s,/console\.log\([^\n]*overview\s*\)/);
 assert.match(s,/campaign_counts:overview\.campaign_counts/);
 assert.match(s,/issue_report:overview\.issue_report/);
});
