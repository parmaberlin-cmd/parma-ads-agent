const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('one object can surface multiple supported issue families',()=>{
 const report=buildMetaIssueReport({ads:[{campaign_id:'c',issues:[{message:'creative video unavailable'},{message:'policy review rejected'}]}]});
 assert.deepEqual(report.objects[0].categories,['creative_or_media','policy_or_review']);
});
