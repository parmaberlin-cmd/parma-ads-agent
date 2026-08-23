const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner has stable unexpected-error fallback',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/meta_issue_report_failed/);
});
