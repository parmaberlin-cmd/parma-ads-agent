const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('issue report has stable machine-readable contract',()=>{
 const report=buildMetaIssueReport({ads:[{id:'a',campaign_id:'c',adset_id:'s',name:'Ad',issues:[{level:'ERROR',code:'1',summary:'Creative unavailable',message:'Video unavailable'}]}]});
 assert.equal(typeof report.affected_objects,'number');
 assert.equal(typeof report.categories,'object');
 assert.ok(Array.isArray(report.objects));
 assert.deepEqual(Object.keys(report.objects[0]),['object_level','name','campaign_ref','issue_count','categories','issues']);
});
