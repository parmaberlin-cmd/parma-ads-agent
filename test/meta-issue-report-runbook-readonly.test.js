const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runbook explicitly forbids activation and budget changes',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/read-only/i);
 assert.match(text,/never authorizes campaign activation, budget changes, or object creation/i);
});
