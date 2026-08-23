const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('sanitized issue messages remain bounded when classified',()=>{
 const issues=sanitizeMetaIssues([{error_summary:'S'.repeat(500),error_message:'M'.repeat(800)}]);
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues}]});
 assert.equal(report.objects[0].issues[0].summary.length,180);
 assert.equal(report.objects[0].issues[0].message.length,300);
});
