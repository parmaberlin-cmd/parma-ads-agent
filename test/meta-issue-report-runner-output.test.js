const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner never serializes raw result overview or diagnostics',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(s,/JSON\.stringify\(result\)|JSON\.stringify\(overview\)|issue_diagnostics/);
 assert.match(s,/affected_objects:0,categories:\{\},objects:\[\]/);
});
