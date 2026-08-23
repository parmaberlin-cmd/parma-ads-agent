const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('dedicated report step contains no Page or Instagram asset selection inputs',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const report=workflow.split('- name: Run sanitized read-only Meta issue report')[1];
 assert.doesNotMatch(report,/PAGE_ID|INSTAGRAM_USER_ID|MEDIA_ID/);
});
