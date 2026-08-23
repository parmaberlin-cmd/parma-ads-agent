const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow contains no call-to-action or destination controls',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/BOOK_NOW|CTA|call_to_action|DESTINATION|RESERVATION_URL/);
});
