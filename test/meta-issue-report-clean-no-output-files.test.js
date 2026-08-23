const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow does not write GitHub runner output files',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/GITHUB_(ENV|OUTPUT|PATH|STATE|STEP_SUMMARY)/);
});
