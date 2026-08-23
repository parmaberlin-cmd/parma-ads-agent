const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow does not run tests after secrets are introduced',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const report=w.split('- name: Run sanitized read-only Meta issue report')[1];
 assert.doesNotMatch(report,/npm test|node --test/);
});
