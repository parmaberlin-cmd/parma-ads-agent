const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic report step declares exactly three Meta environment values',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const report=workflow.split('- name: Run sanitized read-only Meta issue report')[1];
 const keys=(report.match(/^\s{10}META_[A-Z_]+:/gm)||[]).map(x=>x.trim().split(':')[0]);
 assert.deepEqual(keys,['META_ACCESS_TOKEN','META_AD_ACCOUNT_ID','META_API_VERSION']);
});
