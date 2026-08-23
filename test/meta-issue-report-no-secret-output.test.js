const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('classified issue report contains no credential-shaped fields',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'1',issues:[{level:'ERROR',summary:'delivery issue',message:'review configuration'}]}],adsets:[],ads:[]});
 const text=JSON.stringify(report);
 assert.doesNotMatch(text,/access_token|refresh_token|client_secret|password/i);
});
