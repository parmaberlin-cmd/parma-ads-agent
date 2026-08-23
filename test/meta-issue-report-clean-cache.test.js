const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow setup uses Node 20 and npm cache only',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.match(workflow,/node-version: 20/);
 assert.match(workflow,/cache: npm/);
 assert.equal((workflow.match(/cache:/g)||[]).length,1);
});
