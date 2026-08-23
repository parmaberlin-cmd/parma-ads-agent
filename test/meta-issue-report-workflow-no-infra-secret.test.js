const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic workflow uses no infrastructure or database credentials',()=>{
 const w=fs.readFileSync('.github/workflows/meta-issue-report.yml','utf8');
 assert.doesNotMatch(w,/RAILWAY_|DATABASE_|AWS_|AZURE_|GCLOUD_/);
});
