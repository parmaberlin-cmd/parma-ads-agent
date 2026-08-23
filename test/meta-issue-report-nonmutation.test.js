const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('building report does not mutate collector diagnostics',()=>{
 const diagnostics={campaigns:[{id:'c',issues:[{message:'creative unavailable'}]}]};
 const before=JSON.stringify(diagnostics);
 buildMetaIssueReport(diagnostics);
 assert.equal(JSON.stringify(diagnostics),before);
});
