const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('per-object issue_count reflects diagnostic evidence count',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'a'},{message:'b'},{message:'c'}]}]});
 assert.equal(report.objects[0].issue_count,3);
});
