const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner does not read campaign write approval tokens',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(source,/APPROVAL|CREATE_PARMA/);
});
