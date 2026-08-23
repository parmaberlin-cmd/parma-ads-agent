const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta secrets are introduced only at dedicated diagnostic step',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const marker='- name: Run sanitized read-only Meta issue report';
 const before=w.split(marker)[0]; const after=w.split(marker)[1];
 assert.doesNotMatch(before,/META_ACCESS_TOKEN|META_AD_ACCOUNT_ID|META_API_VERSION/);
 assert.match(after,/META_ACCESS_TOKEN/); assert.match(after,/META_AD_ACCOUNT_ID/); assert.match(after,/META_API_VERSION/);
});
