const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow references only explicit Meta secrets',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const refs=[...(workflow.matchAll(/secrets\.([A-Z0-9_]+)/g))].map(m=>m[1]);
 assert.deepEqual(refs,['META_ACCESS_TOKEN','META_AD_ACCOUNT_ID','META_API_VERSION']);
});
