const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow does not persist secrets through runner command files',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/GITHUB_ENV|GITHUB_OUTPUT|GITHUB_STATE|GITHUB_PATH|GITHUB_STEP_SUMMARY/);
});
