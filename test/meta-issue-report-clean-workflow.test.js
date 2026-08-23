const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('manual Meta issue workflow stays read-only and isolated',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/node scripts\/run-meta-issue-report\.js/);
 assert.doesNotMatch(workflow,/\b(push|schedule|pull_request|repository_dispatch):/);
 assert.doesNotMatch(workflow,/WRITE|APPROVAL|BUDGET|ACTIVE|createPaused|POST|DELETE/);
 assert.equal((workflow.match(/secrets\./g)||[]).length,3);
});
