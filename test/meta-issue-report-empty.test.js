const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('empty diagnostics produce a stable zero-issue report',()=>{
 assert.deepEqual(buildMetaIssueReport({}),{affected_objects:0,categories:{},objects:[]});
});
