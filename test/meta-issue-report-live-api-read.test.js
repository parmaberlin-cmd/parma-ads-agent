const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue fields are requested through the existing GET collection helper',()=>{
 const s=fs.readFileSync('live-shadow-data.js','utf8'); const m=s.split('async function collectMetaShadowData')[1].split('async function collectLiveShadowInput')[0];
 assert.match(m,/const getCollection=.*client\.get/);
 assert.equal((m.match(/issues_info/g)||[]).length>=6,true);
});
