const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow does not invoke campaign creation or execution modules',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/meta-paused-draft|meta-dinner|execution|budget-governance|activate|publish/i);
});
