const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('runbook avoids repairing historical campaigns just to clear dashboard issues',()=>{
 const text=fs.readFileSync('docs/meta-issue-diagnostic-runbook.md','utf8');
 assert.match(text,/Do not repair completed or intentionally paused historical campaigns merely to make the dashboard green/);
});
