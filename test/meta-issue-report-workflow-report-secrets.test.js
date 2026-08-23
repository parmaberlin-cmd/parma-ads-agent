const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('dedicated report step receives all required Meta read credentials',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const report=workflow.split('- name: Run sanitized read-only Meta issue report')[1];
 assert.match(report,/META_ACCESS_TOKEN/);
 assert.match(report,/META_AD_ACCOUNT_ID/);
 assert.match(report,/META_API_VERSION/);
});
