const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('WITH_ISSUES status text alone is not treated as a root cause',()=>{
 assert.equal(classifyIssue({message:'WITH_ISSUES'}),'unknown');
});
