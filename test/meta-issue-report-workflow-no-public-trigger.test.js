const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow on block contains only workflow_dispatch',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const onBlock=workflow.split('on:')[1].split('jobs:')[0];
 assert.match(onBlock,/workflow_dispatch:/);
 assert.equal((onBlock.match(/^[ ]{2}[a-zA-Z_]+:/gm)||[]).length,1);
});
