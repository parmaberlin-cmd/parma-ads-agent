const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow has one read-only report step',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.equal((workflow.match(/Run sanitized read-only Meta issue report/g)||[]).length,1);
});
