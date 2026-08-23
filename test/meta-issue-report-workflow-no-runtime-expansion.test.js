const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow has no alternate runtime container or self-hosted runner',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/python|ruby|java|docker|container:|services:|self-hosted|windows-|macos-/i);
});
