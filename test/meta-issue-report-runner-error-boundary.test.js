const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner does not expose stack traces or environment on error',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(s,/error\.stack|process\.env\)|JSON\.stringify\(process\.env/);
 assert.match(s,/String\(error\?\.message/);
});
