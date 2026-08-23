const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('same diagnostics produce identical issue report',()=>{
 const d={campaigns:[{id:'c',issues:[{message:'invalid budget'}]}]};
 assert.deepEqual(buildMetaIssueReport(d),buildMetaIssueReport(d));
});
