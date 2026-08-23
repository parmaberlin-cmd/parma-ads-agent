const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow uses only checkout and setup-node actions',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const actions=[...(workflow.matchAll(/uses:\s*([^\n]+)/g))].map(m=>m[1].trim());
 assert.deepEqual(actions,['actions/checkout@v4','actions/setup-node@v4']);
});
