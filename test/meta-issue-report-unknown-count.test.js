const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('unknown categories remain visible in aggregate summary',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'opaque x'}]}],ads:[{campaign_id:'c',issues:[{message:'opaque y'}]}]});
 assert.equal(report.categories.unknown,2);
});
