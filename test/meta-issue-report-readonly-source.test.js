const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta shadow collector source has no client POST calls',()=>{
 const source=fs.readFileSync('live-shadow-data.js','utf8');
 assert.doesNotMatch(source,/client\.post\s*\(/);
 assert.match(source,/client\.get\s*\(/);
});
