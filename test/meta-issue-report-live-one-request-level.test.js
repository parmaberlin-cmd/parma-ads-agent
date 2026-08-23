const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta collector defines one campaign adset and ad issue query in the collection batch',()=>{
 const s=fs.readFileSync('live-shadow-data.js','utf8'); const m=s.split('async function collectMetaShadowData')[1].split('async function collectLiveShadowInput')[0];
 assert.equal((m.match(/\/campaigns`/g)||[]).length,1);
 assert.equal((m.match(/\/adsets`/g)||[]).length,1);
 assert.equal((m.match(/\/ads`/g)||[]).length,1);
});
