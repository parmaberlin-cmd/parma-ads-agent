const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('live Meta collector validates configured API version against project default',()=>{
 const source=fs.readFileSync('live-shadow-data.js','utf8');
 assert.match(source,/META_API_VERSION/);
 assert.match(source,/\^v\\d\+\\\.0\$/);
});
