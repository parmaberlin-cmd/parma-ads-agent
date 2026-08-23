const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('Meta issue sanitizer bounds count and message lengths',()=>{
 const issues=Array.from({length:30},(_,i)=>({level:'ERROR',error_code:i,error_summary:'x'.repeat(300),error_message:'y'.repeat(500)}));
 const out=sanitizeMetaIssues(issues);
 assert.equal(out.length,20);
 assert.ok(out.every(x=>x.summary.length<=180&&x.message.length<=300));
});
