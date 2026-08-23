const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue runner only invokes read collector and emits sanitized report shape',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/collectMetaShadowData/);
 assert.match(source,/issue_report/);
 assert.doesNotMatch(source,/createPaused|axios|\.post\(|\.delete\(|WRITE|APPROVAL|BUDGET|access_token/);
});
