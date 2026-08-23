const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('future repair guidance explicitly preserves PAUSED state',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/preserve PAUSED state/);
});
