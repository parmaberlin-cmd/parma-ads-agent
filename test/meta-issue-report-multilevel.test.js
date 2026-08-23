const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('report keeps campaign linkage across all object levels',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'policy review'}]}],adsets:[{id:'s',campaign_id:'c',issues:[{message:'invalid audience location'}]}],ads:[{id:'a',campaign_id:'c',adset_id:'s',issues:[{message:'creative video unavailable'}]}]});
 assert.equal(report.affected_objects,3);
 assert.ok(report.objects.every(row=>row.campaign_ref==='c'));
 assert.deepEqual(new Set(report.objects.map(row=>row.object_level)),new Set(['campaign','adset','ad']));
});
