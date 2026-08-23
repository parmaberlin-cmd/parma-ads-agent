const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('undefined diagnostics are handled as an empty report',()=>{
 assert.deepEqual(buildMetaIssueReport(),{affected_objects:0,categories:{},objects:[]});
});
