const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow invokes no alternate runtime or container',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/python|ruby|java|docker|container:|services:/i);
 assert.match(workflow,/node-version: 20/);
});
