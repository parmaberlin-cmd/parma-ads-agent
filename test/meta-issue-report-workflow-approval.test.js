const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('read-only Meta diagnostic workflow requires no write approval token',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(workflow,/CREATE_PARMA_META_DRAFT_PAUSED_ONLY|APPROVAL_TOKEN/);
});
