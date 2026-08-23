const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('schedule/date diagnostics classify as schedule',()=>{
 assert.equal(classifyIssue({message:'End date is invalid'}),'schedule');
});
