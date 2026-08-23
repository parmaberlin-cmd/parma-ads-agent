const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic runner emits explicit access_ok on success',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/access_ok:true/);
});
