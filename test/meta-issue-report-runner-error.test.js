const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta report runner emits compact access failure shape',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(s,/\{access_ok:false,error:result\.error\|\|'meta_read_failed'\}/);
});
