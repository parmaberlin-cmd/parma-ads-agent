const { runMetaPausedPreflight } = require('./meta-preflight');

function normalizeStatus(object){return String(object?.status||object?.effective_status||'UNKNOWN').toUpperCase();}
function isPaused(object){return normalizeStatus(object)==='PAUSED';}

async function inspectNamedDraftChain({transport,adAccountId,draft}){
  const campaigns=(await transport.get(`/${adAccountId}/campaigns`,{fields:'id,name,status,effective_status,objective',limit:100})).data||[];
  const matches=campaigns.filter(c=>c.name===draft.campaign.name);
  if(matches.length>1)return {safe:false,blockers:['duplicate_campaigns'],campaign_matches:matches.length,knownPartial:{}};
  if(matches.length===0)return {safe:true,blockers:[],campaign_matches:0,knownPartial:{}};
  const campaign=matches[0];
  if(!isPaused(campaign)||campaign.objective!==draft.campaign.objective)return {safe:false,blockers:['campaign_not_resumable'],campaign_matches:1,knownPartial:{campaign_id:campaign.id}};
  const adsets=(await transport.get(`/${campaign.id}/adsets`,{fields:'id,name,status,effective_status,campaign_id',limit:100})).data||[];
  if(adsets.length>1)return {safe:false,blockers:['multiple_adsets'],campaign_matches:1,knownPartial:{campaign_id:campaign.id}};
  const knownPartial={campaign_id:campaign.id};
  if(adsets[0]){if(!isPaused(adsets[0]))return {safe:false,blockers:['adset_not_paused'],campaign_matches:1,knownPartial};knownPartial.adset_id=adsets[0].id;const ads=(await transport.get(`/${adsets[0].id}/ads`,{fields:'id,name,status,effective_status,adset_id,creative{id,name}',limit:100})).data||[];if(ads.length>1)return {safe:false,blockers:['multiple_ads'],campaign_matches:1,knownPartial};if(ads[0]){if(!isPaused(ads[0]))return {safe:false,blockers:['ad_not_paused'],campaign_matches:1,knownPartial};knownPartial.ad_id=ads[0].id;knownPartial.creative_id=ads[0].creative?.id||null;}}
  return {safe:true,blockers:[],campaign_matches:1,knownPartial};
}

async function runMetaRealPreflight({transport,adAccountId,draft,assets,writeGateEnabled,approvalTokenOk}){
  const chain=await inspectNamedDraftChain({transport,adAccountId,draft});
  const staticPreflight=runMetaPausedPreflight({draft,assets,writeGateEnabled,approvalTokenOk,knownPartial:chain.knownPartial});
  const blockers=[...chain.blockers,...(staticPreflight.level_1_readiness?.blockers||[]),...(staticPreflight.level_2_payload?.blockers||[])];
  return {success:true,mode:'read_only',ready:chain.safe&&staticPreflight.ready&&blockers.length===0,chain:{safe:chain.safe,campaign_matches:chain.campaign_matches,has_campaign:Boolean(chain.knownPartial.campaign_id),has_adset:Boolean(chain.knownPartial.adset_id),has_creative:Boolean(chain.knownPartial.creative_id),has_ad:Boolean(chain.knownPartial.ad_id)},blockers:[...new Set(blockers)],maximum_attempts:1,may_activate:false,may_spend:false};
}
module.exports={inspectNamedDraftChain,runMetaRealPreflight,isPaused};
