const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow needs no separate business page or system user identifiers',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/BUSINESS_ID|PAGE_ID|SYSTEM_USER|INSTAGRAM_USER_ID/);
});
