const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow does not use runner command files',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/::set-output|::save-state|::add-path/);
});
