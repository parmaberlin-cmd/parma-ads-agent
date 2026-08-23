const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow has no hidden vars event interpolation or checkout override',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/vars\.|inputs\.|github\.event|repository:|ref:|submodules:|lfs:|persist-credentials:/);
});
