function compact(value){
  if(Array.isArray(value)) return value.map(compact).filter(v=>v!==undefined);
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,compact(v)]).filter(([,v])=>v!==undefined));
  return value===null||value===''?undefined:value;
}

function buildConservativePausedPayloads(draft, ids={}){
  const campaign=compact({
    name:draft.campaign?.name,
    objective:draft.campaign?.objective,
    buying_type:draft.campaign?.buying_type,
    is_adset_budget_sharing_enabled:draft.campaign?.is_adset_budget_sharing_enabled,
    special_ad_categories:draft.campaign?.special_ad_categories||[],
    status:'PAUSED',
  });
  const targeting=compact({
    ...(draft.adSet?.targeting||{}),
    targeting_automation:draft.adSet?.targeting?.targeting_automation||{advantage_audience:0},
  });
  const adset=compact({
    name:draft.adSet?.name,
    campaign_id:ids.campaign_id||'<campaign_id>',
    lifetime_budget:draft.adSet?.lifetime_budget,
    billing_event:draft.adSet?.billing_event,
    optimization_goal:draft.adSet?.optimization_goal,
    bid_strategy:draft.adSet?.bid_strategy,
    start_time:draft.adSet?.start_time,
    end_time:draft.adSet?.end_time,
    destination_type:draft.adSet?.destination_type,
    dsa_beneficiary:draft.adSet?.dsa_beneficiary,
    dsa_payor:draft.adSet?.dsa_payor,
    pacing_type:draft.adSet?.pacing_type,
    adset_schedule:draft.adSet?.adset_schedule,
    targeting,
    status:'PAUSED',
  });
  const creative=compact({
    name:draft.creative?.name,
    object_id:draft.creative?.object_id,
    instagram_user_id:draft.creative?.instagram_user_id,
    source_instagram_media_id:draft.creative?.source_instagram_media_id,
  });
  const ad=compact({
    name:draft.ad?.name,
    adset_id:ids.adset_id||'<adset_id>',
    creative:{creative_id:ids.creative_id||'<creative_id>'},
    status:'PAUSED',
  });
  return {campaign,adset,creative,ad};
}

function comparePayloadRisk(original, conservative){
  const removed=Object.keys(original||{}).filter(k=>!(k in (conservative||{})));
  const added=Object.keys(conservative||{}).filter(k=>!(k in (original||{})));
  return {removed_fields:removed,added_fields:added,field_count:Object.keys(conservative||{}).length,contains_active:JSON.stringify(conservative||{}).toUpperCase().includes('"ACTIVE"')};
}
module.exports={compact,buildConservativePausedPayloads,comparePayloadRisk};
