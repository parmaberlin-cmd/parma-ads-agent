const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow remains one job with four steps',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8'); const jobs=w.split('jobs:')[1];
 assert.equal((jobs.match(/^  [a-zA-Z_-]+:\s*$/gm)||[]).length,1);
 assert.equal((w.match(/^\s{6}- /gm)||[]).length,4);
 assert.equal((w.match(/\brun:/g)||[]).length,2); assert.equal((w.match(/\buses:/g)||[]).length,2);
});
