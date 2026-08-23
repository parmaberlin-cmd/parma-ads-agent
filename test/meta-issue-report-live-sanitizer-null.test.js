const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('Meta issue sanitizer is null safe',()=>{
 assert.deepEqual(sanitizeMetaIssues(null),[]);
 assert.deepEqual(sanitizeMetaIssues({}),[]);
});
