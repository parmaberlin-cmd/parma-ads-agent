const ALLOWED={
 campaign:new Set(['name','objective','buying_type','is_adset_budget_sharing_enabled','special_ad_categories','status']),
 adset:new Set(['name','campaign_id','lifetime_budget','billing_event','optimization_goal','bid_strategy','start_time','end_time','destination_type','dsa_beneficiary','dsa_payor','pacing_type','adset_schedule','targeting','status']),
 creative:new Set(['name','object_id','instagram_user_id','source_instagram_media_id']),
 ad:new Set(['name','adset_id','creative','status']),
};
function validateStagePayload(stage,payload={}){
 const allowed=ALLOWED[stage];if(!allowed)return {valid:false,unknown_fields:Object.keys(payload),reason:'unknown_stage'};
 const unknown=Object.keys(payload).filter(k=>!allowed.has(k));
 const active=JSON.stringify(payload).toUpperCase().includes('"ACTIVE"');
 return {valid:unknown.length===0&&!active,unknown_fields:unknown,contains_active:active};
}
function validatePayloadSet(payloads={}){
 const stages=['campaign','adset','creative','ad'];
 const results=Object.fromEntries(stages.map(s=>[s,validateStagePayload(s,payloads[s]||{})]));
 return {valid:stages.every(s=>results[s].valid),stages:results};
}
module.exports={ALLOWED,validateStagePayload,validatePayloadSet};
