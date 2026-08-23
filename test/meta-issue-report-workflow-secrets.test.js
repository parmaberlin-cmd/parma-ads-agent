const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue workflow passes only Meta read credentials/version',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.match(workflow,/META_ACCESS_TOKEN/);
 assert.match(workflow,/META_AD_ACCOUNT_ID/);
 assert.doesNotMatch(workflow,/WRITE_GATE|APPROVAL_TOKEN|DAILY_BUDGET/);
});
