'use strict';
const axios=require('axios');
const {googleAdsVersion}=require('google-ads-api/build/src/version');
const ID=/^\d{1,20}$/;
function createNegativeRestAdapter(customer,{http=axios.create()}={}){
 const customerId=String(customer?.credentials?.customer_id||'');
 if(!ID.test(customerId)||typeof customer.getAccessToken!=='function'||!/^v\d+$/.test(googleAdsVersion))throw Error('invalid_google_adapter');
 async function mutate(operation,{validate_only}){
  if(typeof validate_only!=='boolean'||!operation||!['create','remove'].includes(operation.type))throw Error('invalid_negative_operation');
  let providerOperation;
  if(operation.type==='create'){
   if(!ID.test(operation.campaign_id)||operation.match_type!=='EXACT'||typeof operation.text!=='string'||operation.text!==operation.text.trim()||!operation.text||operation.text.length>80)throw Error('invalid_negative_operation');
   providerOperation={create:{campaign:`customers/${customerId}/campaigns/${operation.campaign_id}`,negative:true,keyword:{text:operation.text,matchType:'EXACT'}}};
  }else{
   if(!new RegExp(`^customers/${customerId}/campaignCriteria/[0-9]+~[0-9]+$`).test(String(operation.resource_name||'')))throw Error('invalid_negative_operation');
   providerOperation={remove:operation.resource_name};
  }
  const token=await customer.getAccessToken();
  const response=await http.request({method:'POST',url:`https://googleads.googleapis.com/${googleAdsVersion}/customers/${customerId}/campaignCriteria:mutate`,timeout:15000,maxRedirects:0,
   headers:{...customer.callHeaders,Authorization:`Bearer ${token}`},data:{operations:[providerOperation],validateOnly:validate_only,partialFailure:false}});
  return response.data;
 }
 return {customerId,mutate};
}
module.exports={createNegativeRestAdapter};
