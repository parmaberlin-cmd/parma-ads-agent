const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('classification preserves original sanitized diagnostic evidence',()=>{
 const issue={level:'ERROR',code:'42',summary:'Opaque',message:'Evidence'};
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[issue]}]});
 assert.deepEqual(report.objects[0].issues,[issue]);
});
