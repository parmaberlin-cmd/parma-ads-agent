const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook sanitizes diagnostic text before reporting and classification',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.ok(text.indexOf('Sanitize diagnostic text before reporting') < text.indexOf('Classify only when'));
});
