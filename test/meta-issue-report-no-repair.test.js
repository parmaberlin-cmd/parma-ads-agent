const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('issue classification module contains no network or campaign mutation code',()=>{
 const s=fs.readFileSync('meta-issue-classification.js','utf8');
 assert.doesNotMatch(s,/axios|fetch\(|\.post\(|\.delete\(|createCampaign|updateCampaign|activate/i);
});
