const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook requires safe orchestrator before any future repair write',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/Before any repair write, run the safe orchestrator preflight/);
});
