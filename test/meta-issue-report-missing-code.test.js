const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('missing Meta diagnostic code remains null',()=>{
 assert.equal(sanitizeMetaIssues([{}])[0].code,null);
});
