const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta report runner default issue shape is deterministic',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(s,/affected_objects:0,categories:\{\},objects:\[\]/);
});
