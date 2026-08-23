const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook requires affected object chain identification before repair candidacy',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/repair candidates only after the affected object and parent chain are identified/);
});
