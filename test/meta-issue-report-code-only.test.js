const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('unmapped numeric code alone remains unknown',()=>{
 assert.equal(classifyIssue({code:'1870227'}),'unknown');
});
