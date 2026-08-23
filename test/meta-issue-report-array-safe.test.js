const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('non-array issue evidence fails closed to empty list',()=>{
 assert.deepEqual(sanitizeMetaIssues({message:'x'}),[]);
});
