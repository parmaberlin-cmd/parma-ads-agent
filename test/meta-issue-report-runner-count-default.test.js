const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner has stable empty campaign-count fallback',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/campaign_counts:overview\.campaign_counts\|\|\{\}/);
});
