const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('issue report does not add credential or environment fields',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'1',issues:[{message:'x'}]}]});
 const serialized=JSON.stringify(report);
 assert.doesNotMatch(serialized,/access_token|META_ACCESS_TOKEN|secret/i);
});
