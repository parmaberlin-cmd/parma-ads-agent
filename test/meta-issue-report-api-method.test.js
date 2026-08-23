const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue runner calls collector and no write module',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/collectMetaShadowData/);
 assert.doesNotMatch(source,/meta-paused-draft|meta-safe-orchestrator|executePausedMetaDraftSafely/);
});
