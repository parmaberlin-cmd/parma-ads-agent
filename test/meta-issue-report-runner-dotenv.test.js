const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner loads environment through dotenv without printing it',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(source,/require\('dotenv'\)\.config\(\)/);
 assert.doesNotMatch(source,/console\.log\(process\.env/);
});
