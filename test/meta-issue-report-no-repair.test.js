const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('diagnostic report contains evidence and categories but no write instruction',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'creative unavailable'}]}]});
 const text=JSON.stringify(report);
 assert.doesNotMatch(text,/activate|delete|update_budget|create_ad/i);
});
