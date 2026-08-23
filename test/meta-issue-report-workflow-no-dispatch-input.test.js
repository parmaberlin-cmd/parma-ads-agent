const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic manual trigger accepts no user-controlled inputs',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8'); const on=w.split('on:')[1].split('jobs:')[0];
 assert.match(on,/workflow_dispatch:/); assert.doesNotMatch(on,/inputs:/);
});
