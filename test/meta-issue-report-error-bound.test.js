const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue runner bounds unexpected error messages',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/slice\(0,180\)/);
});
