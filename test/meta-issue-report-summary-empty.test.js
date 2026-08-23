const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('objects without issue evidence do not fabricate aggregate categories',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[]}]});
 assert.deepEqual(report.categories,{});
});
