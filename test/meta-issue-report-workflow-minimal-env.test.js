const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow environment contains exactly three Meta entries',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const envBlock=workflow.split('env:')[1].split('run:')[0];
 const keys=(envBlock.match(/^\s+META_[A-Z_]+:/gm)||[]).map(x=>x.trim().split(':')[0]);
 assert.deepEqual(keys,['META_ACCESS_TOKEN','META_AD_ACCOUNT_ID','META_API_VERSION']);
});
