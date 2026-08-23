const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('manual Meta issue workflow invokes only the read-only report runner',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.match(workflow,/run-meta-issue-report\.js/);
 assert.doesNotMatch(workflow,/createPaused|safe-create|POST|ACTIVE/);
});
