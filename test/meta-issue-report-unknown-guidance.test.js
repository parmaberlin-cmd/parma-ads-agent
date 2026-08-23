const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook requires unknown when diagnostic text is insufficient',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/otherwise keep `unknown`/);
});
