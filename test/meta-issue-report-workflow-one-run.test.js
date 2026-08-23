const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner is invoked exactly once per workflow dispatch',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.equal((w.match(/run-meta-issue-report\.js/g)||[]).length,1);
});
