const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('Meta issue title is used when error_summary is absent',()=>{
 assert.equal(sanitizeMetaIssues([{title:'Delivery issue'}])[0].summary,'Delivery issue');
});
