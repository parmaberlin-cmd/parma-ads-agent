const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('live Meta collector includes WITH_ISSUES or explicit issues_info objects',()=>{
 const source=fs.readFileSync('live-shadow-data.js','utf8');
 const meta=source.split('async function collectMetaShadowData')[1].split('async function collectLiveShadowInput')[0];
 assert.match(meta,/effective_status==="WITH_ISSUES"\|\|x\.issues_info\?\.length/);
});
