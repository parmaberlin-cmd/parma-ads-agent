'use strict';
const axios=require('axios');
const {googleAdsVersion}=require('google-ads-api/build/src/version');
function createBudgetRestAdapter(customer,{http=axios.create()}={}){
 const customerId=customer?.credentials?.customer_id;
 if(!/^\d{1,20}$/.test(customerId)||typeof customer.getAccessToken!=='function'||!/^v\d+$/.test(googleAdsVersion))throw Error('invalid_google_adapter');
 return {customerId,mutateResources:async(operations,options)=>{
   if(!Array.isArray(operations)||operations.length!==1||typeof options?.validate_only!=='boolean'||options.partial_failure!==false)throw Error('invalid_budget_operation');
   const op=operations[0],r=op.resource;
   if(op.entity!=='campaign_budget'||op.operation!=='update'||!r||Object.keys(r).sort().join(',')!=='amount_micros,resource_name'||
     !new RegExp(`^customers/${customerId}/campaignBudgets/[0-9]+$`).test(r.resource_name)||!Number.isSafeInteger(r.amount_micros)||r.amount_micros<=0)throw Error('invalid_budget_operation');
   const token=await customer.getAccessToken();
   // Isolated Axios instance: no retries or redirects; credentials stay in this process.
   const response=await http.request({method:'POST',url:`https://googleads.googleapis.com/${googleAdsVersion}/customers/${customerId}/campaignBudgets:mutate`,
     timeout:15000,maxRedirects:0,headers:{...customer.callHeaders,Authorization:`Bearer ${token}`},
     data:{operations:[{update:{resourceName:r.resource_name,amountMicros:String(r.amount_micros)},updateMask:'amount_micros'}],validateOnly:options.validate_only,partialFailure:false}});
   return response.data;
 }};
}
module.exports={createBudgetRestAdapter};
