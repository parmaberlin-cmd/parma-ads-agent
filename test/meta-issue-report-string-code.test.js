const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('numeric Meta diagnostic codes normalize to strings',()=>{
 assert.equal(sanitizeMetaIssues([{error_code:100}])[0].code,'100');
});
