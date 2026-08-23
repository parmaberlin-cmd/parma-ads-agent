const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook permits sanitized campaign and ad names for diagnosis',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/may expose sanitized campaign\/ad names and issue text/);
});
