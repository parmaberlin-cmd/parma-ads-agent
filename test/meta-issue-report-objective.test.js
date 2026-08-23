const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('objective incompatibility classifies as delivery configuration',()=>{
 assert.equal(classifyIssue({message:'Objective incompatible with optimization'}),'delivery_configuration');
});
