const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('payment diagnostics classify as account or billing',()=>{
 assert.equal(classifyIssue({message:'Payment method problem'}),'account_or_billing');
});
