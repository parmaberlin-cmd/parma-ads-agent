const { validateDraft } = require("./meta-draft-validation");

function assessMetaPausedLiveTestReadiness({draft,assets={},writeGateEnabled=false,approvalTokenOk=false,knownPartial={}}={}){
  const checks={
    draft_valid:validateDraft(draft||{}).valid,
    page_resolved:Boolean(assets.page_id),
    instagram_resolved:Boolean(assets.instagram_user_id),
    reel_resolved:Boolean(assets.source_instagram_media_id),
    write_gate_enabled:writeGateEnabled===true,
    approval_token_ok:approvalTokenOk===true,
    no_active_status:JSON.stringify(draft||{}).toUpperCase().includes('"ACTIVE"')===false,
  };
  const reusable=Boolean(knownPartial.campaign_id||knownPartial.adset_id||knownPartial.creative_id||knownPartial.ad_id);
  const blockers=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
  return {
    ready:blockers.length===0,
    checks,
    blockers,
    recovery_mode:reusable,
    creates_active_delivery:false,
    maximum_attempts:1,
  };
}

module.exports={assessMetaPausedLiveTestReadiness};
