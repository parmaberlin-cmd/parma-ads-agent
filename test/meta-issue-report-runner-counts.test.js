const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta report runner includes campaign delivery counts for context',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(s,/campaign_counts:overview\.campaign_counts\|\|\{\}/);
});
