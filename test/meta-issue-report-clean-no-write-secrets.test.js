const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow exposes no campaign write controls',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/WRITE_GATE|APPROVAL_TOKEN|ONE_SHOT|DAILY_BUDGET|LIFETIME_BUDGET|CAMPAIGN_NAME|ADSET_NAME|AD_NAME/);
});
