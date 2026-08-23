const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('unrecognized diagnostics are surfaced instead of silently treated as repairable',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'opaque condition 777'}]}]});
 assert.deepEqual(report.objects[0].categories,['unknown']);
 assert.equal(report.categories.unknown,1);
});
