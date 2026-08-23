const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('missing Meta diagnostic message remains empty rather than invented',()=>{
 assert.equal(sanitizeMetaIssues([{}])[0].message,'');
});
