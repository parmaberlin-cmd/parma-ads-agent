const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta credentials are exposed only to diagnostic runner step',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const prefix=workflow.split('- name: Run sanitized read-only Meta issue report')[0];
 assert.doesNotMatch(prefix,/META_ACCESS_TOKEN|META_AD_ACCOUNT_ID|META_API_VERSION/);
 const report=workflow.split('- name: Run sanitized read-only Meta issue report')[1];
 assert.match(report,/META_ACCESS_TOKEN/);
 assert.match(report,/META_AD_ACCOUNT_ID/);
});
