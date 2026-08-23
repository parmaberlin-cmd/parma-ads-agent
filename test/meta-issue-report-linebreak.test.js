const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('diagnostic line breaks are removed before reporting',()=>{
 const issue=sanitizeMetaIssues([{error_message:'one\ntwo\tthree'}])[0];
 assert.equal(issue.message,'one two three');
});
