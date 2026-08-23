const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('live Meta collector requests issues_info at all delivery levels and builds issue report',()=>{
 const source=fs.readFileSync('live-shadow-data.js','utf8');
 assert.match(source,/campaigns[^\n]+issues_info/);
 assert.match(source,/adsets[^\n]+issues_info/);
 assert.match(source,/ads[^\n]+issues_info/);
 assert.match(source,/buildMetaIssueReport/);
});
