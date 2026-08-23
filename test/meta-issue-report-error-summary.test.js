const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('classifier uses sanitized summary as evidence',()=>{
 assert.equal(classifyIssue({summary:'Creative unavailable',message:''}),'creative_or_media');
});
