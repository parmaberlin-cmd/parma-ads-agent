const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('Meta issue sanitizer caps issue entries at twenty per object',()=>{
 const out=sanitizeMetaIssues(Array.from({length:50},(_,i)=>({error_code:i,error_summary:'issue'})));
 assert.equal(out.length,20);
});
