const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner does not expose GA4 channel data',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.doesNotMatch(source,/ga4|GA4/);
});
