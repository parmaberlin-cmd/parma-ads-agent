const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('generic Meta message field is used when error_message is absent',()=>{
 assert.equal(sanitizeMetaIssues([{message:'Delivery issue details'}])[0].message,'Delivery issue details');
});
