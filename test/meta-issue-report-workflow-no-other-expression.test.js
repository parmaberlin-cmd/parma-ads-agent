const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow uses expressions only for explicit secrets',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const expressions=[...(workflow.matchAll(/\$\{\{([^}]+)\}\}/g))].map(m=>m[1].trim());
 assert.ok(expressions.every(x=>x.startsWith('secrets.')));
});
