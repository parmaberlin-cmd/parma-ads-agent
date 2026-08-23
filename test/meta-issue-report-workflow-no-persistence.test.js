const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow has no output persistence or repository mutation path',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/upload-artifact|GITHUB_(ENV|OUTPUT|PATH|STATE|STEP_SUMMARY)|git push|gh pr|deploy|release/i);
 assert.doesNotMatch(w,/strategy:|matrix:|needs:|\bif:/);
});
