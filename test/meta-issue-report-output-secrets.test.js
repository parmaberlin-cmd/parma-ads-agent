const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook forbids secret values in diagnostic output',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/must not print access tokens, secret values, or environment variables/);
});
