const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('report level ordering is deterministic campaign then adset then ad',()=>{
 const report=buildMetaIssueReport({ads:[{campaign_id:'c',issues:[]}],campaigns:[{id:'c',issues:[]}],adsets:[{campaign_id:'c',issues:[]}]});
 assert.deepEqual(report.objects.map(x=>x.object_level),['campaign','adset','ad']);
});
