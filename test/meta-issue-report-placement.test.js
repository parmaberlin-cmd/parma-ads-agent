const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('placement diagnostics classify as targeting or placement',()=>{
 assert.equal(classifyIssue({message:'Placement is not available'}),'targeting_or_placement');
});
