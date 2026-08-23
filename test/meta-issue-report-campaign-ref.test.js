const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('campaign diagnostics self-link campaign_ref to campaign id',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'campaign-x',issues:[]}]});
 assert.equal(report.objects[0].campaign_ref,'campaign-x');
});
