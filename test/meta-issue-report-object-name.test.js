const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('missing object names remain null instead of fabricated labels',()=>{
 const report=buildMetaIssueReport({adsets:[{campaign_id:'c',issues:[{message:'x'}]}]});
 assert.equal(report.objects[0].name,null);
});
