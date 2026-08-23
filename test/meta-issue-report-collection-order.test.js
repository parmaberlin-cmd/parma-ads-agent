const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook begins with campaign ad set and ad issue collection',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/Collect campaign, ad set and ad `issues_info` plus effective status/);
});
