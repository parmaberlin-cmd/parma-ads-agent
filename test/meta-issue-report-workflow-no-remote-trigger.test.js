const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow has no remote reusable or event-driven trigger',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/workflow_call|repository_dispatch|workflow_run|issue_comment|pull_request|push:|schedule:/);
});
