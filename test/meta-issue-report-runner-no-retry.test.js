const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner performs exactly one collector call and no retry loop',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.equal((s.match(/await collectMetaShadowData\(\)/g)||[]).length,1);
 assert.doesNotMatch(s,/setTimeout|setInterval|retry/i);
});
