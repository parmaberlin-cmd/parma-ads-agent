const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow passes no campaign write configuration',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/META_DRAFT_WRITE_ENABLED|ONE_SHOT_TRIGGER|DAILY_BUDGET_EUR/);
});
