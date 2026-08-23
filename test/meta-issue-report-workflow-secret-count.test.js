const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow references exactly three repository secrets',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.equal((w.match(/\$\{\{ secrets\./g)||[]).length,3);
});
