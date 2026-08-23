const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('collector caps issue evidence to twenty entries per object',()=>{
 assert.equal(sanitizeMetaIssues(Array.from({length:30},()=>({message:'x'}))).length,20);
});
