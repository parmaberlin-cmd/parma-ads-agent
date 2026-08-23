const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow contains no HTTP mutation command or write endpoint',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/POST|PUT|PATCH|DELETE|\/campaigns\b|\/adsets\b|\/ads\b/);
});
