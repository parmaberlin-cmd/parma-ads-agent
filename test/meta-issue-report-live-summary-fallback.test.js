const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('Meta issue sanitizer supplies a bounded generic summary when absent',()=>{
 const [x]=sanitizeMetaIssues([{}]);
 assert.equal(x.summary,'meta_delivery_issue');
 assert.equal(x.message,'');
});
