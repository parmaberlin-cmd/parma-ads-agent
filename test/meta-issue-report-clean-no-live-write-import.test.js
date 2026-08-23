const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic runner imports no Meta write module',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(source,/meta-paused-draft|meta-ads|write-gate|execution/);
 assert.match(source,/live-shadow-data/);
});
