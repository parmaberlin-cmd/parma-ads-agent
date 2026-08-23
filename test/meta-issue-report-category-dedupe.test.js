const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('multiple issues in same family count affected object once per category',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'creative video unavailable'},{message:'creative image unavailable'}]}]});
 assert.deepEqual(report.objects[0].categories,['creative_or_media']);
 assert.equal(report.categories.creative_or_media,1);
 assert.equal(report.objects[0].issue_count,2);
});
