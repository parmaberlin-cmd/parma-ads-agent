const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow contains exactly one isolated job',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const jobs=workflow.split('jobs:')[1];
 assert.equal((jobs.match(/^  [a-zA-Z_-]+:\s*$/gm)||[]).length,1);
 assert.match(jobs,/^  diagnose:/m);
});
