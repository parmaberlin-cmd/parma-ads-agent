const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('known and unknown issue families can coexist on one object',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'invalid budget'},{message:'opaque condition'}]}]});
 assert.deepEqual(report.objects[0].categories,['delivery_configuration','unknown']);
});
