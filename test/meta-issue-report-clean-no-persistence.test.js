const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow does not persist diagnostics or mutate repository',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/upload-artifact|GITHUB_STEP_SUMMARY|GITHUB_OUTPUT|git push|gh pr|deploy/i);
});
