const { assessMetaPausedLiveTestReadiness }=require('./meta-live-test-readiness');
const { buildConservativePausedPayloads }=require('./meta-safe-payload');

function runMetaPausedPreflight(input={}){
 const readiness=assessMetaPausedLiveTestReadiness(input);
 const payloads=buildConservativePausedPayloads(input.draft||{},input.knownPartial||{});
 const payloadChecks={
  campaign_paused:payloads.campaign.status==='PAUSED',
  adset_paused:payloads.adset.status==='PAUSED',
  ad_paused:payloads.ad.status==='PAUSED',
  no_active_literal:!JSON.stringify(payloads).toUpperCase().includes('"ACTIVE"'),
  campaign_has_objective:Boolean(payloads.campaign.objective),
  adset_has_budget:Number(payloads.adset.daily_budget)>0,
  creative_has_page:Boolean(payloads.creative.object_id),
  creative_has_instagram:Boolean(payloads.creative.instagram_user_id),
  creative_has_media:Boolean(payloads.creative.source_instagram_media_id),
 };
 const payloadBlockers=Object.entries(payloadChecks).filter(([,ok])=>!ok).map(([k])=>k);
 return {ready:readiness.ready&&payloadBlockers.length===0,level_1_readiness:readiness,level_2_payload:{checks:payloadChecks,blockers:payloadBlockers},payloads,maximum_attempts:1,may_activate:false};
}
module.exports={runMetaPausedPreflight};
