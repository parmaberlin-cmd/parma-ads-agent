const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta collector normalizes diagnostic object references to strings',()=>{
 const s=fs.readFileSync('live-shadow-data.js','utf8'); const m=s.split('overview.issue_diagnostics=')[1].split('overview.issue_report=')[0];
 assert.match(m,/id:String\(x\.id\)/);
 assert.match(m,/campaign_id:String\(x\.campaign_id\|\|""\)/);
});
