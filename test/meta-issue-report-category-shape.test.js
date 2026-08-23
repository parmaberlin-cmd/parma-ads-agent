const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('category summary values are numeric affected-object counts',()=>{
 const report=buildMetaIssueReport({campaigns:[{id:'c',issues:[{message:'invalid budget'}]}]});
 assert.equal(typeof report.categories.delivery_configuration,'number');
});
