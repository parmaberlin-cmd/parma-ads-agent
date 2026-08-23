const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow contains no Page Instagram or media selection controls',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/PAGE_ID|INSTAGRAM_USER_ID|MEDIA_ID|INSTAGRAM_MEDIA_ID/);
});
