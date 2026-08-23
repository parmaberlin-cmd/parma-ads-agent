const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMetaIssueReport}=require('../meta-issue-classification');

test('object rows expose campaign linkage but not raw object id fields',()=>{
 const report=buildMetaIssueReport({ads:[{id:'ad-secret-ish',campaign_id:'c',adset_id:'s',issues:[]}]});
 assert.equal(Object.prototype.hasOwnProperty.call(report.objects[0],'id'),false);
 assert.equal(Object.prototype.hasOwnProperty.call(report.objects[0],'adset_id'),false);
});
