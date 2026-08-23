const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner does not directly read access token',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(source,/META_ACCESS_TOKEN|access_token/);
});
