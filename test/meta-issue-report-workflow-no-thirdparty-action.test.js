const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow invokes no third-party GitHub actions',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const actions=[...(w.matchAll(/uses:\s*([^\n]+)/g))].map(m=>m[1].trim());
 assert.ok(actions.every(x=>x.startsWith('actions/')));
});
