const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow never echoes secret environment values',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/echo.*META_|printenv|env \|/);
});
