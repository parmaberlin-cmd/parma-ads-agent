'use strict';

const CUSTOMER_ID='7376153998';
const EXACT_NEGATIVE_DELEGATION=Object.freeze({
  id:'philippe-2026-09-04-exact-negatives-5',
  customer_id:CUSTOMER_ID,
  scope:'negative_keyword_addition',
  campaign_id:'23853417314',
  match_type:'EXACT',
  allowed_terms:Object.freeze(['sly restaurant berlin']),
  max_actions:5,
  expires_at:'2026-09-04T21:59:59.000Z',
  source:'explicit_owner_delegation',
});

function resolveStandingAuthorization(action,{now=Date.now()}={}){
  if(!action||action.campaign_id!==EXACT_NEGATIVE_DELEGATION.campaign_id||action.action_type!==EXACT_NEGATIVE_DELEGATION.scope)return null;
  if(now>=Date.parse(EXACT_NEGATIVE_DELEGATION.expires_at))return null;
  const term=String(action.proposed_value?.term||'').trim().toLocaleLowerCase('de-DE');
  const match=String(action.proposed_value?.match_type||'');
  if(match!==EXACT_NEGATIVE_DELEGATION.match_type||!EXACT_NEGATIVE_DELEGATION.allowed_terms.includes(term))return null;
  return {persisted:true,authorization_id:EXACT_NEGATIVE_DELEGATION.id,action_id:action.action_id,campaign_id:action.campaign_id,scope:action.action_type,expires_at:EXACT_NEGATIVE_DELEGATION.expires_at,source:EXACT_NEGATIVE_DELEGATION.source};
}
function resolveStandingAuthorizations(actions,{now=Date.now()}={}){
  return (Array.isArray(actions)?actions:[]).map(a=>resolveStandingAuthorization(a,{now})).filter(Boolean);
}
function summary(now=Date.now()){
  return {customer_id:CUSTOMER_ID,active:now<Date.parse(EXACT_NEGATIVE_DELEGATION.expires_at),delegations:[{id:EXACT_NEGATIVE_DELEGATION.id,scope:EXACT_NEGATIVE_DELEGATION.scope,campaign_id:EXACT_NEGATIVE_DELEGATION.campaign_id,match_type:EXACT_NEGATIVE_DELEGATION.match_type,max_actions:EXACT_NEGATIVE_DELEGATION.max_actions,expires_at:EXACT_NEGATIVE_DELEGATION.expires_at}],budget_delegation_active:false,primary_conversion_changes:false,tracking_semantic_changes:false};
}
module.exports={CUSTOMER_ID,EXACT_NEGATIVE_DELEGATION,resolveStandingAuthorization,resolveStandingAuthorizations,summary};
