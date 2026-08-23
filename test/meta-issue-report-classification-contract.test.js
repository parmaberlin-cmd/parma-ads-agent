const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('classified issue report summarizes affected delivery objects',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'1',name:'x',issues:[{level:'ERROR',code:'100',summary:'Invalid parameter',message:'Invalid parameter'}]}],adsets:[],ads:[]});
 assert.equal(report.affected_objects,1);
 assert.ok(Array.isArray(report.objects));
 assert.equal(report.objects.length,1);
});
