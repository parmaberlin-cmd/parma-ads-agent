const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow runs only its dedicated runner after dependency install',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const runCommands=[...(workflow.matchAll(/^\s+-?\s*run:\s*(.+)$/gm))].map(m=>m[1].trim());
 assert.deepEqual(runCommands,['npm ci','node scripts/run-meta-issue-report.js']);
});
