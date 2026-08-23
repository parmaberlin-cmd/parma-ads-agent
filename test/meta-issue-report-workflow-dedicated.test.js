const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow has exactly one Node execution and it is the dedicated report runner',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const nodeRuns=[...(workflow.matchAll(/run:\s*(node[^\n]+)/g))].map(m=>m[1].trim());
 assert.deepEqual(nodeRuns,['node scripts/run-meta-issue-report.js']);
});
