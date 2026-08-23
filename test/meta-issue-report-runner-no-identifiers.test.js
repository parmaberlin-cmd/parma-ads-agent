const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner does not explicitly emit account or credential environment values',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(s,/META_ACCESS_TOKEN|META_AD_ACCOUNT_ID|process\.env/);
});
