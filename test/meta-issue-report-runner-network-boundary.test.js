const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta report runner has no direct network or write-module path',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(s,/axios|fetch\(|https?:|graph\.facebook|meta-paused-draft|write-gate|execution/);
 assert.match(s,/live-shadow-data/);
});
