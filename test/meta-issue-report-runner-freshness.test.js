const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner exposes collection time but no environment metadata',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/collected_at/);
 assert.doesNotMatch(source,/process\.env/);
});
