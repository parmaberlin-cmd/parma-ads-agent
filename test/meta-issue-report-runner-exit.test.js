const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner explicitly marks read failures and leaves success non-mutating',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(s,/access_ok:false/); assert.match(s,/process\.exitCode=1/); assert.match(s,/access_ok:true/);
 assert.doesNotMatch(s,/process\.exitCode=0|process\.exit\(0\)/);
});
