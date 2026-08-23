const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Node setup occurs before Meta secrets are introduced',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.ok(workflow.indexOf('actions/setup-node@v4') < workflow.indexOf('META_ACCESS_TOKEN'));
});
