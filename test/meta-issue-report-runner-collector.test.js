const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner invokes Meta collector directly rather than full multi-channel collection',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/collectMetaShadowData\(\)/);
 assert.doesNotMatch(source,/collectLiveShadowInput|collectGoogleShadowData/);
});
