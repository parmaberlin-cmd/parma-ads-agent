const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook treats billing and policy diagnostics as escalation candidates',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/account\/billing and policy\/review issues as human\/escalation candidates/);
});
