const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta diagnostic runner does not force nonzero exit on success path',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 const success=source.split('const overview')[1].split('})().catch')[0];
 assert.doesNotMatch(success,/exitCode=1/);
});
