'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createBudgetRestAdapter}=require('../google-budget-rest-adapter');
const client=()=>({credentials:{customer_id:'1'},getAccessToken:async()=>'',callHeaders:{}});
const op={entity:'campaign_budget',operation:'update',resource:{resource_name:'customers/1/campaignBudgets/2',amount_micros:1000000}};
test('REST validates exact field only, bounded and without redirects',async()=>{
 let request;const a=createBudgetRestAdapter(client(),{http:{request:async r=>{request=r;return {data:{}};}}});
 await a.mutateResources([op],{validate_only:true,partial_failure:false});
 assert.match(request.url,/googleads.googleapis.com\/v\d+\/customers\/1\/campaignBudgets:mutate$/);
 assert.equal(request.timeout,15000);assert.equal(request.maxRedirects,0);assert.equal(request.data.validateOnly,true);assert.equal(request.data.partialFailure,false);assert.equal(request.data.operations[0].updateMask,'amount_micros');
});
test('REST does not retry failed mutation',async()=>{
 let calls=0;const a=createBudgetRestAdapter(client(),{http:{request:async()=>{calls++;throw Error('failed');}}});
 await assert.rejects(a.mutateResources([op],{validate_only:false,partial_failure:false}));assert.equal(calls,1);
});
test('REST rejects foreign budget before token retrieval',async()=>{
 const c=client();c.getAccessToken=()=>assert.fail();const a=createBudgetRestAdapter(c);
 await assert.rejects(a.mutateResources([{...op,resource:{...op.resource,resource_name:'customers/9/campaignBudgets/2'}}],{validate_only:true,partial_failure:false}));
});
test('REST rejects extra fields and missing explicit options',async()=>{
 const c=client();c.getAccessToken=()=>assert.fail();const a=createBudgetRestAdapter(c);
 await assert.rejects(a.mutateResources([{...op,resource:{...op.resource,status:'ENABLED'}}],{validate_only:true,partial_failure:false}));
 await assert.rejects(a.mutateResources([op],{}));
});
