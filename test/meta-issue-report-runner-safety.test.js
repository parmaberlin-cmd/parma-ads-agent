const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Meta issue runner delegates only to read collector and emits compact report',()=>{
 const s=fs.readFileSync('scripts/run-meta-issue-report.js','utf8');
 assert.match(s,/collectMetaShadowData/); assert.match(s,/campaign_counts/); assert.match(s,/issue_report/);
 assert.doesNotMatch(s,/axios|fetch\(|\.post\(|\.delete\(|createPaused|WRITE|APPROVAL|BUDGET|META_ACCESS_TOKEN|META_AD_ACCOUNT_ID|issue_diagnostics/);
 assert.match(s,/if\(!result\.access_ok\)/); assert.match(s,/process\.exitCode=1/); assert.match(s,/slice\(0,180\)/);
});
