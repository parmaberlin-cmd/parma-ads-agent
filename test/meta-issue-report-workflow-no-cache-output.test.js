const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow caches npm dependencies only',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.match(workflow,/cache: npm/);
 assert.doesNotMatch(workflow,/cache.*report|cache.*diagnostic/i);
});
