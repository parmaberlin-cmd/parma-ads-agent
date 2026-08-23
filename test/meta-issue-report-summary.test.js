const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('affected_objects equals number of diagnostic object rows',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'1',issues:[]}],adsets:[{campaign_id:'1',issues:[]}],ads:[{campaign_id:'1',issues:[]}]});
 assert.equal(report.affected_objects,report.objects.length);
});
