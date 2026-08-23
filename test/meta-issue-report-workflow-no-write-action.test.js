const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow contains no commit PR issue or deployment action',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/create-pull-request|commit|push|issue|deploy|publish/i);
});
