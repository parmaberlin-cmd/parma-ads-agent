const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('live Meta diagnostic path requests all levels and remains GET-only',()=>{
 const s=fs.readFileSync('live-shadow-data.js','utf8'); const m=s.split('async function collectMetaShadowData')[1].split('async function collectLiveShadowInput')[0];
 assert.match(m,/campaigns[^\n]+issues_info/); assert.match(m,/adsets[^\n]+issues_info/); assert.match(m,/ads[^\n]+issues_info/); assert.match(m,/buildMetaIssueReport/);
 assert.match(m,/client\.get/); assert.doesNotMatch(m,/client\.(post|put|patch|delete)/);
 const out=sanitizeMetaIssues(Array.from({length:30},()=>({error_summary:'x'.repeat(300),error_message:'y'.repeat(500)})));
 assert.equal(out.length,20); assert.ok(out.every(x=>x.summary.length<=180&&x.message.length<=300));
});
