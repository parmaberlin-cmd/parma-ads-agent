const crypto=require('crypto');
const { buildConservativePausedPayloads }=require('./meta-safe-payload');
const { runMetaPausedPreflight }=require('./meta-preflight');

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
function fingerprint(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}
function buildFinalMetaManifest({draft,assets,knownPartial={},writeGateEnabled=false,approvalTokenOk=false}={}){
 const preflight=runMetaPausedPreflight({draft,assets,knownPartial,writeGateEnabled,approvalTokenOk});
 const payloads=buildConservativePausedPayloads(draft||{},knownPartial);
 const serialized=JSON.stringify(payloads).toUpperCase();
 const stages=['campaign','adset','creative','ad'];
 const createOrReuse={campaign:knownPartial.campaign_id?'reuse':'create',adset:knownPartial.adset_id?'reuse':'create',creative:knownPartial.creative_id?'reuse':'create',ad:knownPartial.ad_id?'reuse':'create'};
 return {
  ready:Boolean(preflight.ready),
  mode:'paused_draft_only',
  fingerprint:fingerprint({payloads,knownPartial}),
  stages,
  create_or_reuse:createOrReuse,
  maximum_attempts:1,
  verification_mode:'read_only',
  corrective_writes_allowed:false,
  duplicate_creation_allowed:false,
  active_literal_present:serialized.includes('"ACTIVE"'),
  may_activate:false,
  may_spend:false,
  blockers:[...(preflight.level_1_readiness?.blockers||[]),...(preflight.level_2_payload?.blockers||[])],
  payload_summary:{campaign_fields:Object.keys(payloads.campaign||{}),adset_fields:Object.keys(payloads.adset||{}),creative_fields:Object.keys(payloads.creative||{}),ad_fields:Object.keys(payloads.ad||{})},
 };
}
module.exports={stable,fingerprint,buildFinalMetaManifest};
