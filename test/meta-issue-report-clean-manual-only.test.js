const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow is manual-only',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const onBlock=workflow.split('on:')[1].split('jobs:')[0];
 assert.match(onBlock,/workflow_dispatch:/);
 assert.doesNotMatch(onBlock,/push:|pull_request:|schedule:|repository_dispatch:|workflow_call:/);
});
