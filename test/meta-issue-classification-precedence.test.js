const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('permission diagnosis wins over generic creative wording',()=>{
 assert.equal(classifyIssue({message:'Permission missing for Instagram creative asset'}),'asset_or_permission');
});
test('billing diagnosis wins over generic account wording',()=>{
 assert.equal(classifyIssue({message:'Account billing payment problem'}),'account_or_billing');
});
