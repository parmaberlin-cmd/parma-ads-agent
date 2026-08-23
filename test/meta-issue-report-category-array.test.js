const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('per-object categories remain machine-readable arrays',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'payment problem'}]}]});
 assert.ok(Array.isArray(report.objects[0].categories));
});
