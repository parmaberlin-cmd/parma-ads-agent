const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta workflow has exactly one application Node invocation and it is diagnostic',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const nodeRuns=[...(w.matchAll(/run:\s*(node[^\n]+)/g))].map(m=>m[1].trim());
 assert.deepEqual(nodeRuns,['node scripts/run-meta-issue-report.js']);
});
