const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('missing diagnostic summary receives neutral fallback',()=>{
 assert.equal(sanitizeMetaIssues([{}])[0].summary,'meta_delivery_issue');
});
