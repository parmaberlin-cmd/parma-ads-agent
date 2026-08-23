const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner unexpected errors fail the workflow',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 const catcher=source.split('})().catch')[1];
 assert.match(catcher,/process\.exitCode=1/);
});
