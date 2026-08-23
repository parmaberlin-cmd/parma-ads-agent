const { runMetaPausedPreflight }=require('./meta-preflight');

function buildMetaOneShotExecutionPlan(input={}){
 const preflight=runMetaPausedPreflight(input);
 const existing=input.knownPartial||{};
 const order=[];
 if(!existing.campaign_id) order.push('create_campaign'); else order.push('reuse_campaign');
 if(!existing.adset_id) order.push('create_adset'); else order.push('reuse_adset');
 if(!existing.creative_id) order.push('create_creative'); else order.push('reuse_creative');
 if(!existing.ad_id) order.push('create_ad'); else order.push('reuse_ad');
 order.push('verify_all_paused');
 return {
  executable:preflight.ready,
  mode:'paused_draft_only',
  order,
  maximum_attempts:1,
  duplicate_creation_forbidden:true,
  active_delivery_forbidden:true,
  preflight,
 };
}
module.exports={buildMetaOneShotExecutionPlan};
