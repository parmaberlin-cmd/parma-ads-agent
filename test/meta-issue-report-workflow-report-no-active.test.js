const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('dedicated report step contains no ACTIVE state',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const report=workflow.split('- name: Run sanitized read-only Meta issue report')[1];
 assert.doesNotMatch(report,/ACTIVE/);
});
