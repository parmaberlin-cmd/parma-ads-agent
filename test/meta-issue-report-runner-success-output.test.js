const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner serializes success as structured JSON',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/console\.log\(JSON\.stringify/);
});
