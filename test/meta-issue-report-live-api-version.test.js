const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta collector rejects malformed API version overrides',()=>{
 const s=fs.readFileSync('live-shadow-data.js','utf8');
 assert.match(s,/\^v\\d\+\\\.0\$/.source ? s : s/);
 assert.match(s,/candidate\)\?candidate:META_API_VERSION/);
});
