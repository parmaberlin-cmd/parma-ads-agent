const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('plural collector keys normalize to singular object levels',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[]}],adsets:[{campaign_id:'c',issues:[]}],ads:[{campaign_id:'c',issues:[]}]});
 assert.deepEqual(report.objects.map(x=>x.object_level),['campaign','adset','ad']);
});
