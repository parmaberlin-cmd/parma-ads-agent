const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('issue report accepts sanitized collector diagnostic shape',()=>{
 const diagnostics={campaigns:[{id:'1',name:'Dinner',issues:[{level:'ERROR',code:'100',summary:'Creative unavailable',message:'Video unavailable'}]}],adsets:[],ads:[]};
 const report=buildMetaIssueReport(diagnostics);
 assert.equal(report.affected_objects,1);
 assert.equal(report.categories.creative_or_media,1);
 assert.equal(report.objects[0].name,'Dinner');
});
