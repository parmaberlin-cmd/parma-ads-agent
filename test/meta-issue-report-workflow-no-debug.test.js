const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow does not enable runner debug tracing',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG/);
});
