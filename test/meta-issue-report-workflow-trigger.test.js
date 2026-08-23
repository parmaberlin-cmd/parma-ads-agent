const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue diagnostic workflow is manual dispatch only',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.match(workflow,/workflow_dispatch/);
 assert.doesNotMatch(workflow,/schedule:|push:|pull_request:/);
});
