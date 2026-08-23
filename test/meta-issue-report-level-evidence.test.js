const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('ERROR level alone does not imply a root cause',()=>{
 assert.equal(classifyIssue({level:'ERROR'}),'unknown');
});
