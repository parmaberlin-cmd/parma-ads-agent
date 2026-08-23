const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitizeMetaIssues}=require('../live-shadow-data');

test('Meta issue sanitizer removes line breaks and bounds diagnostic text',()=>{
 const [x]=sanitizeMetaIssues([{level:'ERROR\nX',error_code:100,error_summary:'a\nb\t'+ 'x'.repeat(300),error_message:'m\rn'+ 'y'.repeat(500)}]);
 assert.doesNotMatch(x.summary,/\r|\n|\t/); assert.doesNotMatch(x.message,/\r|\n|\t/);
 assert.ok(x.summary.length<=180); assert.ok(x.message.length<=300);
});
