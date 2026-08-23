const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta collector diagnostic function has no HTTP mutation method',()=>{
 const s=fs.readFileSync('live-shadow-data.js','utf8'); const m=s.split('async function collectMetaShadowData')[1].split('async function collectLiveShadowInput')[0];
 assert.doesNotMatch(m,/\.post\(|\.put\(|\.patch\(|\.delete\(/);
});
