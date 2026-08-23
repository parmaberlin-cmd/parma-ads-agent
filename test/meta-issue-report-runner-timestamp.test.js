const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta report runner includes collector timestamp for evidence freshness',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(s,/collected_at:result\.collected_at/);
});
