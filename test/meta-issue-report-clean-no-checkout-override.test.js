const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic checkout does not override repository ref submodules or credentials',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/repository:|ref:|submodules:|lfs:|persist-credentials:/);
});
