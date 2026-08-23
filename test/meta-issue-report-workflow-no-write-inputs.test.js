const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow contains no campaign mutation inputs',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/WRITE|APPROVAL|BUDGET|CAMPAIGN_NAME|ADSET_NAME|AD_NAME|TARGET|PLACEMENT|CTA|OBJECTIVE|START_TIME|END_TIME/);
});
