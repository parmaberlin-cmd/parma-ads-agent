const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic runner fails closed when Meta read access is unavailable',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/if\(!result\.access_ok\)/);
 assert.match(source,/process\.exitCode=1/);
});
