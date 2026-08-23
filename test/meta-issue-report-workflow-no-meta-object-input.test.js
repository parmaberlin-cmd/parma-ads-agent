const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow has no campaign adset ad or media object selection input',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/CAMPAIGN_ID|ADSET_ID|AD_ID|MEDIA_ID|PAGE_ID|INSTAGRAM_USER_ID/);
});
