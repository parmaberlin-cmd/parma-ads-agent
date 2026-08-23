const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner selects fields rather than serializing full overview',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(source,/JSON\.stringify\(overview/);
});
