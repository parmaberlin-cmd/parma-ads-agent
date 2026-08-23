const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow uses only checkout and setup-node actions',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const uses=[...(workflow.matchAll(/uses:\s*([^\s]+)/g))].map(m=>m[1]);
 assert.deepEqual(uses,['actions/checkout@v4','actions/setup-node@v4']);
});
