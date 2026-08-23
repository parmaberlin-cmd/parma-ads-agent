const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic report step environment allowlist is exact',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8'); const r=w.split('- name: Run sanitized read-only Meta issue report')[1];
 const keys=(r.match(/^\s{10}META_[A-Z_]+:/gm)||[]).map(x=>x.trim().split(':')[0]);
 assert.deepEqual(keys,['META_ACCESS_TOKEN','META_AD_ACCOUNT_ID','META_API_VERSION']);
});
