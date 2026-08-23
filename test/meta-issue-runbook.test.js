const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue runbook preserves paused safe-write boundary',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/Do not repair completed or intentionally paused historical campaigns/);
 assert.match(text,/preserve PAUSED state/);
 assert.match(text,/verify Meta's returned status independently/);
});
