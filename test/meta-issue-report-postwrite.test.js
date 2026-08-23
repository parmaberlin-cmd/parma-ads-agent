const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook requires independent status verification after future repair writes',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/After any future repair write, verify Meta's returned status independently/);
});
