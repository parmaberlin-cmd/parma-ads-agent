const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow cannot select another repository or ref for checkout',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 const checkout=w.split('actions/checkout@v4')[1].split('- uses: actions/setup-node@v4')[0];
 assert.doesNotMatch(checkout,/with:|repository:|ref:/);
});
