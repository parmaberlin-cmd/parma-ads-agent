const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('live Meta collector attaches both sanitized diagnostics and classified issue report',()=>{
 const source=fs.readFileSync('live-shadow-data.js','utf8');
 const meta=source.split('async function collectMetaShadowData')[1].split('async function collectLiveShadowInput')[0];
 assert.match(meta,/overview\.issue_diagnostics=/);
 assert.match(meta,/overview\.issue_report=buildMetaIssueReport/);
});
