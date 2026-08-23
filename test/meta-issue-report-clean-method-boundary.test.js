const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('live Meta collector diagnostic path contains no HTTP mutation methods',()=>{
 const source=fs.readFileSync('live-shadow-data.js','utf8');
 const meta=source.split('async function collectMetaShadowData')[1].split('async function collectLiveShadowInput')[0];
 assert.match(meta,/client\.get/);
 assert.doesNotMatch(meta,/client\.(post|put|patch|delete)/);
});
