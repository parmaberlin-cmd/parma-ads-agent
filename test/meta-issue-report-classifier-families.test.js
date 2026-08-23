const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyIssue}=require('../meta-issue-classification');

test('classifier emits only supported conservative families for representative evidence',()=>{
 const samples=['payment problem','permission denied','creative unavailable','policy rejected','invalid location','invalid budget','invalid end date','opaque'];
 const allowed=new Set(['account_or_billing','asset_or_permission','creative_or_media','policy_or_review','targeting_or_placement','delivery_configuration','schedule','unknown']);
 for(const message of samples) assert.ok(allowed.has(classifyIssue({message})));
});
