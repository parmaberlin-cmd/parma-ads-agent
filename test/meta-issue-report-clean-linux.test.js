const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow uses standard hosted Linux runner',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.match(workflow,/runs-on: ubuntu-latest/);
 assert.doesNotMatch(workflow,/self-hosted|windows-|macos-/);
});
