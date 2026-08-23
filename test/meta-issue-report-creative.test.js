const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('Reel media diagnostics classify as creative or media',()=>{
 assert.equal(classifyIssue({message:'Instagram Reel media unavailable'}),'asset_or_permission');
});
