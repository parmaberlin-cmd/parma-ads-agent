const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta secrets are scoped to the dedicated report step rather than workflow or job level',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const beforeReport=workflow.split('- name: Run sanitized read-only Meta issue report')[0];
 assert.doesNotMatch(beforeReport,/META_ACCESS_TOKEN|META_AD_ACCOUNT_ID|META_API_VERSION/);
});
