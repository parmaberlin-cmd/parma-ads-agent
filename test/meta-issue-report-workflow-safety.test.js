const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue workflow is manual read-only minimal and secret-scoped',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const on=w.split('on:')[1].split('jobs:')[0];
 assert.match(on,/workflow_dispatch:/); assert.doesNotMatch(on,/push:|pull_request:|schedule:|repository_dispatch:/);
 assert.deepEqual([...(w.matchAll(/secrets\.([A-Z0-9_]+)/g))].map(m=>m[1]),['META_ACCESS_TOKEN','META_AD_ACCOUNT_ID','META_API_VERSION']);
 assert.doesNotMatch(w,/WRITE_GATE|APPROVAL|BUDGET|ACTIVE|upload-artifact|GITHUB_OUTPUT|GITHUB_STEP_SUMMARY|permissions:/);
 assert.deepEqual([...(w.matchAll(/^\s+-?\s*run:\s*(.+)$/gm))].map(m=>m[1].trim()),['npm ci','node scripts/run-meta-issue-report.js']);
});
