const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta collector error path returns bounded diagnostic fields rather than credentials',()=>{
 const s=fs.readFileSync('live-shadow-data.js','utf8'); const m=s.split('async function collectMetaShadowData')[1].split('async function collectLiveShadowInput')[0];
 assert.match(m,/error:error\?\.response\?\.data\?\.error\?\.message/);
 assert.doesNotMatch(m,/return \{[^}]*access_token/);
});
