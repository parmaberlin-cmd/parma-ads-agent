const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('classification is case insensitive',()=>{
 assert.equal(classifyIssue({message:'PAYMENT METHOD PROBLEM'}),'account_or_billing');
});
