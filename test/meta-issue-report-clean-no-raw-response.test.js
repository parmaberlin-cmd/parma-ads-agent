const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic runner never serializes the raw collector result or overview',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(source,/JSON\.stringify\(result\)|JSON\.stringify\(overview\)/);
});
