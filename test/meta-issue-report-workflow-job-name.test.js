const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow declares diagnose job exactly once',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.equal((workflow.match(/^  diagnose:/gm)||[]).length,1);
});
