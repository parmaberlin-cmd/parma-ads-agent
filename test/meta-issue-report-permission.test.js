const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('page access diagnostics classify as asset or permission',()=>{
 assert.equal(classifyIssue({message:'Page access permission denied'}),'asset_or_permission');
});
