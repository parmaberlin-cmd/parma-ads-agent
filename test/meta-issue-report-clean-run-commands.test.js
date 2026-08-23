const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow run-command allowlist is exact',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const commands=[...(workflow.matchAll(/^\s+-?\s*run:\s*(.+)$/gm))].map(m=>m[1].trim());
 assert.deepEqual(commands,['npm ci','node scripts/run-meta-issue-report.js']);
});
