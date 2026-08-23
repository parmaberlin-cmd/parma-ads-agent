const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('manual Meta diagnostic dispatch declares no user write inputs',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/inputs:/);
});
