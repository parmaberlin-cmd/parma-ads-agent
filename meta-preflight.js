const { assessMetaPausedLiveTestReadiness }=require('./meta-live-test-readiness');
const { buildConservativePausedPayloads }=require('./meta-safe-payload');
const { buildRecoveryPlan }=require('./meta-draft-validation');

function runMetaPausedPreflight(input={}){
 const readiness=assessMetaPausedLiveTestReadiness(input);
 const payloads=buildConservativePausedPayloads(input.draft||{},input.knownPartial||{});
 const recoveryPlan=buildRecoveryPlan({created:input.knownPartial||{}});
 const payloadChecks={
  campaign_paused:payloads.campaign.status==='PAUSED',
  adset_paused:payloads.adset.status==='PAUSED',
  ad_paused:payloads.ad.status==='PAUSED',
  no_active_literal:!JSON.stringify(payloads).toUpperCase().includes('"ACTIVE"'),
  campaign_has_objective:Boolean(payloads.campaign.objective),
  adset_has_budget:Number(payloads.adset.lifetime_budget)>0,
  adset_has_targeting:Boolean(payloads.adset.targeting),
  eu_declarations_present:Boolean(payloads.adset.dsa_beneficiary&&payloads.adset.dsa_payor),
  creative_has_page:Boolean(payloads.creative.object_id),
  creative_has_instagram:Boolean(payloads.creative.instagram_user_id),
  creative_has_media:Boolean(payloads.creative.source_instagram_media_id),
  recovery_resume_point_known:Boolean(recoveryPlan.resume_from),
 };
 const payloadBlockers=Object.entries(payloadChecks).filter(([,ok])=>!ok).map(([k])=>k);
 return {
  ready:readiness.ready&&payloadBlockers.length===0,
  level_1_readiness:readiness,
  level_2_payload:{checks:payloadChecks,blockers:payloadBlockers},
  recovery_plan:recoveryPlan,
  payloads,
  maximum_attempts:1,
  may_activate:false,
  duplicates_allowed:false,
 };
}
module.exports={runMetaPausedPreflight};
