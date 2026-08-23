const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('report retains diagnostic code and level for later root-cause analysis',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{level:'ERROR',code:'1870227',summary:'Invalid parameter',message:'x'}]}]});
 assert.equal(report.objects[0].issues[0].code,'1870227');
 assert.equal(report.objects[0].issues[0].level,'ERROR');
});
