const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta collector includes explicit WITH_ISSUES objects even when issue list is empty',()=>{
 const s=fs.readFileSync('live-shadow-data.js','utf8');
 assert.match(s,/x\.effective_status==="WITH_ISSUES"\|\|x\.issues_info\?\.length/);
});
