const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('category summary counts affected objects across levels',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'creative video unavailable'}]}],ads:[{campaign_id:'c',issues:[{message:'creative image unavailable'}]}]});
 assert.equal(report.categories.creative_or_media,2);
});
