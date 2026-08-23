const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow declares exactly one job',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const jobsBlock=workflow.split('jobs:')[1];
 assert.equal((jobsBlock.match(/^  [a-zA-Z_-]+:\s*$/gm)||[]).length,1);
});
