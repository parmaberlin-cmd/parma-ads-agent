const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('missing Meta diagnostic level remains explicitly unknown',()=>{
 assert.equal(sanitizeMetaIssues([{}])[0].level,'unknown');
});
