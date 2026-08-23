const { runMetaPausedPreflight }=require('./meta-preflight');

function baseDraft(){return {campaign:{name:'c',objective:'OUTCOME_TRAFFIC',status:'PAUSED',special_ad_categories:[]},adSet:{name:'s',lifetime_budget:8400,billing_event:'IMPRESSIONS',optimization_goal:'LINK_CLICKS',bid_strategy:'LOWEST_COST_WITHOUT_CAP',dsa_beneficiary:'Parma',dsa_payor:'Parma',targeting:{publisher_platforms:['instagram']},status:'PAUSED'},creative:{name:'x',object_id:'1',instagram_user_id:'2',source_instagram_media_id:'3'},ad:{name:'a',status:'PAUSED'},policy:{may_activate:false}}}
function assets(){return {page_id:'1',instagram_user_id:'2',source_instagram_media_id:'3'}}
function runMetaPreflightAdversarialSuite(){
 const scenarios=[
  ['active_campaign',()=>{const d=baseDraft();d.campaign.status='ACTIVE';return runMetaPausedPreflight({draft:d,assets:assets(),writeGateEnabled:true,approvalTokenOk:true})}],
  ['missing_reel',()=>runMetaPausedPreflight({draft:baseDraft(),assets:{page_id:'1',instagram_user_id:'2'},writeGateEnabled:true,approvalTokenOk:true})],
  ['missing_dsa',()=>{const d=baseDraft();delete d.adSet.dsa_payor;return runMetaPausedPreflight({draft:d,assets:assets(),writeGateEnabled:true,approvalTokenOk:true})}],
  ['gate_off',()=>runMetaPausedPreflight({draft:baseDraft(),assets:assets(),writeGateEnabled:false,approvalTokenOk:true})],
  ['approval_missing',()=>runMetaPausedPreflight({draft:baseDraft(),assets:assets(),writeGateEnabled:true,approvalTokenOk:false})],
 ];
 return scenarios.map(([name,fn])=>{const r=fn();return {name,passed:r.ready===false,blockers:[...(r.level_1_readiness?.blockers||[]),...(r.level_2_payload?.blockers||[])]}});
}
module.exports={runMetaPreflightAdversarialSuite};
