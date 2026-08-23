const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('dependency installation occurs before Meta secrets are introduced',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.ok(workflow.indexOf('run: npm ci') < workflow.indexOf('META_ACCESS_TOKEN'));
});
