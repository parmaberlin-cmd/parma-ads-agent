const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('diagnostic object with no issues remains visible without fabricated category',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[]}]});
 assert.equal(report.objects[0].issue_count,0);
 assert.deepEqual(report.objects[0].categories,[]);
});
