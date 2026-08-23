const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow references ad account id only in env mapping',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.equal((workflow.match(/META_AD_ACCOUNT_ID/g)||[]).length,2);
});
