function compact(value){
  if(Array.isArray(value)) return value.map(compact).filter(v=>v!==undefined);
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,compact(v)]).filter(([,v])=>v!==undefined));
  return value===null||value===''?undefined:value;
}

function buildConservativePausedPayloads(draft, ids={}){
  const campaign=compact({name:draft.campaign?.name,objective:draft.campaign?.objective,status:'PAUSED',special_ad_categories:draft.campaign?.special_ad_categories||[]});
  const adset=compact({name:draft.adSet?.name,campaign_id:ids.campaign_id||'<campaign_id>',daily_budget:draft.adSet?.daily_budget,billing_event:draft.adSet?.billing_event,optimization_goal:draft.adSet?.optimization_goal,bid_strategy:draft.adSet?.bid_strategy,start_time:draft.adSet?.start_time,end_time:draft.adSet?.end_time,targeting:draft.adSet?.targeting,status:'PAUSED'});
  const creative=compact({name:draft.creative?.name,object_id:draft.creative?.object_id,instagram_user_id:draft.creative?.instagram_user_id,source_instagram_media_id:draft.creative?.source_instagram_media_id});
  const ad=compact({name:draft.ad?.name,adset_id:ids.adset_id||'<adset_id>',creative:{creative_id:ids.creative_id||'<creative_id>'},status:'PAUSED'});
  return {campaign,adset,creative,ad};
}

function comparePayloadRisk(original, conservative){
  const removed=Object.keys(original||{}).filter(k=>!(k in (conservative||{})));
  return {removed_fields:removed,field_count:Object.keys(conservative||{}).length,contains_active:JSON.stringify(conservative||{}).toUpperCase().includes('"ACTIVE"')};
}
module.exports={compact,buildConservativePausedPayloads,comparePayloadRisk};
