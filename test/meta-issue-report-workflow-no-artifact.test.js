const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic output is not uploaded cached or persisted as an artifact',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/upload-artifact|download-artifact|artifact|save-state|set-output/i);
});
