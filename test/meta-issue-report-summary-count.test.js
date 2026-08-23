const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('summary counts objects rather than repeated issues in same category',()=>{
 const report=buildMetaIssueReport({ads:[{campaign_id:'c',issues:[{message:'invalid budget'},{message:'bid budget invalid'}]}]});
 assert.equal(report.categories.delivery_configuration,1);
});
