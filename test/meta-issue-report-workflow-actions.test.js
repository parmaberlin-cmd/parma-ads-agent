const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow uses only standard checkout and setup-node actions',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.deepEqual([...(w.matchAll(/uses:\s*([^\n]+)/g))].map(m=>m[1].trim()),['actions/checkout@v4','actions/setup-node@v4']);
 assert.match(w,/runs-on: ubuntu-latest/); assert.match(w,/node-version: 20/); assert.match(w,/cache: npm/);
});
