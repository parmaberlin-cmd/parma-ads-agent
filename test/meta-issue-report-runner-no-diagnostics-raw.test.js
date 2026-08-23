const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner outputs classified report rather than raw issue_diagnostics',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(source,/issue_diagnostics/);
 assert.match(source,/issue_report/);
});
