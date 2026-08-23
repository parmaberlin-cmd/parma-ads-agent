const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('classification uses issues evidence rather than inferring from delivery status',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',effective_status:'WITH_ISSUES',issues:[]}]});
 assert.deepEqual(report.objects[0].categories,[]);
 assert.equal(report.objects[0].issue_count,0);
});
