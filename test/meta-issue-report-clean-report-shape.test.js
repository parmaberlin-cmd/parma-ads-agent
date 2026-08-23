const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('diagnostic runner success output is limited to access timestamp counts and issue report',()=>{
 const source=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 const success=source.match(/console\.log\(JSON\.stringify\((\{access_ok:true[^;]+)\)/)?.[1]||'';
 assert.match(success,/collected_at/);
 assert.match(success,/campaign_counts/);
 assert.match(success,/issue_report/);
 assert.doesNotMatch(success,/overview:|issue_diagnostics|token|account_id/i);
});
