const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('review restrictions classify as policy or review',()=>{
 assert.equal(classifyIssue({message:'Ad restricted after review'}),'policy_or_review');
});
