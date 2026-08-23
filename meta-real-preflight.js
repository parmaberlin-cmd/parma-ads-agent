const { runMetaPausedPreflight } = require('./meta-preflight');

function normalizeStatus(object){return String(object?.status||object?.effective_status||'UNKNOWN').toUpperCase();}
function isPaused(object){return normalizeStatus(object)==='PAUSED';}
function exactName(items,name){return (items||[]).filter(item=>item?.name===name);}

async function findMatchingCreative({transport,adAccountId,draft}){
  const creatives=(await transport.get(`/${adAccountId}/adcreatives`,{fields:'id,name,object_id,instagram_user_id,source_instagram_media_id',limit:100})).data||[];
  const matches=exactName(creatives,draft.creative?.name);
  if(matches.length>1)return {safe:false,blockers:['duplicate_creatives'],creative:null,count:matches.length};
  if(matches.length===0)return {safe:true,blockers:[],creative:null,count:0};
  const creative=matches[0];
  if(draft.creative?.object_id&&creative.object_id&&String(creative.object_id)!==String(draft.creative.object_id))return {safe:false,blockers:['creative_page_mismatch'],creative:null,count:1};
  if(draft.creative?.instagram_user_id&&creative.instagram_user_id&&String(creative.instagram_user_id)!==String(draft.creative.instagram_user_id))return {safe:false,blockers:['creative_instagram_mismatch'],creative:null,count:1};
  return {safe:true,blockers:[],creative,count:1};
}

async function inspectNamedDraftChain({transport,adAccountId,draft}){
  const campaigns=(await transport.get(`/${adAccountId}/campaigns`,{fields:'id,name,status,effective_status,objective',limit:100})).data||[];
  const matches=exactName(campaigns,draft.campaign.name);
  if(matches.length>1)return {safe:false,blockers:['duplicate_campaigns'],campaign_matches:matches.length,creative_matches:0,knownPartial:{}};
  const creativeMatch=await findMatchingCreative({transport,adAccountId,draft});
  if(!creativeMatch.safe)return {safe:false,blockers:creativeMatch.blockers,campaign_matches:matches.length,creative_matches:creativeMatch.count,knownPartial:{}};
  if(matches.length===0){
    const knownPartial={};
    if(creativeMatch.creative)knownPartial.creative_id=creativeMatch.creative.id;
    return {safe:true,blockers:[],campaign_matches:0,creative_matches:creativeMatch.count,knownPartial};
  }
  const campaign=matches[0];
  if(!isPaused(campaign)||campaign.objective!==draft.campaign.objective)return {safe:false,blockers:['campaign_not_resumable'],campaign_matches:1,creative_matches:creativeMatch.count,knownPartial:{campaign_id:campaign.id}};
  const adsets=(await transport.get(`/${campaign.id}/adsets`,{fields:'id,name,status,effective_status,campaign_id',limit:100})).data||[];
  if(adsets.length>1)return {safe:false,blockers:['multiple_adsets'],campaign_matches:1,creative_matches:creativeMatch.count,knownPartial:{campaign_id:campaign.id}};
  const knownPartial={campaign_id:campaign.id};
  if(creativeMatch.creative)knownPartial.creative_id=creativeMatch.creative.id;
  if(adsets[0]){
    if(String(adsets[0].campaign_id||campaign.id)!==String(campaign.id))return {safe:false,blockers:['adset_campaign_mismatch'],campaign_matches:1,creative_matches:creativeMatch.count,knownPartial};
    if(!isPaused(adsets[0]))return {safe:false,blockers:['adset_not_paused'],campaign_matches:1,creative_matches:creativeMatch.count,knownPartial};
    knownPartial.adset_id=adsets[0].id;
    const ads=(await transport.get(`/${adsets[0].id}/ads`,{fields:'id,name,status,effective_status,adset_id,creative{id,name}',limit:100})).data||[];
    if(ads.length>1)return {safe:false,blockers:['multiple_ads'],campaign_matches:1,creative_matches:creativeMatch.count,knownPartial};
    if(ads[0]){
      if(String(ads[0].adset_id||adsets[0].id)!==String(adsets[0].id))return {safe:false,blockers:['ad_adset_mismatch'],campaign_matches:1,creative_matches:creativeMatch.count,knownPartial};
      if(!isPaused(ads[0]))return {safe:false,blockers:['ad_not_paused'],campaign_matches:1,creative_matches:creativeMatch.count,knownPartial};
      if(knownPartial.creative_id&&ads[0].creative?.id&&String(knownPartial.creative_id)!==String(ads[0].creative.id))return {safe:false,blockers:['ad_creative_mismatch'],campaign_matches:1,creative_matches:creativeMatch.count,knownPartial};
      knownPartial.ad_id=ads[0].id;
      knownPartial.creative_id=ads[0].creative?.id||knownPartial.creative_id||null;
    }
  }
  return {safe:true,blockers:[],campaign_matches:1,creative_matches:creativeMatch.count,knownPartial};
}

async function runMetaRealPreflight({transport,adAccountId,draft,assets,writeGateEnabled,approvalTokenOk}){
  const chain=await inspectNamedDraftChain({transport,adAccountId,draft});
  const staticPreflight=runMetaPausedPreflight({draft,assets,writeGateEnabled,approvalTokenOk,knownPartial:chain.knownPartial});
  const blockers=[...chain.blockers,...(staticPreflight.level_1_readiness?.blockers||[]),...(staticPreflight.level_2_payload?.blockers||[])];
  return {success:true,mode:'read_only',ready:chain.safe&&staticPreflight.ready&&blockers.length===0,chain:{safe:chain.safe,campaign_matches:chain.campaign_matches,creative_matches:chain.creative_matches||0,has_campaign:Boolean(chain.knownPartial.campaign_id),has_adset:Boolean(chain.knownPartial.adset_id),has_creative:Boolean(chain.knownPartial.creative_id),has_ad:Boolean(chain.knownPartial.ad_id)},blockers:[...new Set(blockers)],maximum_attempts:1,may_activate:false,may_spend:false,duplicates_allowed:false};
}
module.exports={exactName,findMatchingCreative,inspectNamedDraftChain,runMetaRealPreflight,isPaused};
