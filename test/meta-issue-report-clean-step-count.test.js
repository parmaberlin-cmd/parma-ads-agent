const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic workflow remains a four-step minimal job',()=>{
 const workflow=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.equal((workflow.match(/^\s{6}- /gm)||[]).length,4);
 assert.equal((workflow.match(/\brun:/g)||[]).length,2);
 assert.equal((workflow.match(/\buses:/g)||[]).length,2);
});
