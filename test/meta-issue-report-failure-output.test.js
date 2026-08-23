const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic runner access failure output contains no overview dump',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 const failure=source.split('if(!result.access_ok)')[1].split('const overview')[0];
 assert.doesNotMatch(failure,/overview|issue_diagnostics|process\.env/);
});
