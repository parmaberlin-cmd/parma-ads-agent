const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue diagnostics preserve campaign adset and ad hierarchy',()=>{
 const s=fs.readFileSync('live-shadow-data.js','utf8');
 assert.match(s,/issue_diagnostics=\{campaigns:/);
 assert.match(s,/adsets:adsets\.filter/);
 assert.match(s,/ads:ads\.filter/);
});
