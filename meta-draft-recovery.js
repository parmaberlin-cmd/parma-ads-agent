const { APPROVAL_TOKEN, assertPausedOnly, PartialMetaDraftError } = require("./meta-paused-draft");
const { buildRecoveryPlan } = require("./meta-draft-validation");

function requireId(value,label){const id=String(value||"").trim();if(!/^\d{1,30}$/.test(id))throw new TypeError(`${label} must contain digits`);return id;}

async function verifyPaused(transport, ids) {
  const entries = await Promise.all(Object.entries(ids).filter(([,id])=>id).map(async([name,id])=>{
    const object=await transport.get(`/${id}`,{fields:"id,status,effective_status"});
    return [name,{id,status:object?.status,effective_status:object?.effective_status}];
  }));
  return Object.fromEntries(entries);
}

async function resumePausedReservationDraft({transport,adAccountId,draft,approvalToken,existing={}}={}){
  if(approvalToken!==APPROVAL_TOKEN)throw new Error("Exact paused-draft approval token is required");
  if(!transport||typeof transport.post!=="function"||typeof transport.get!=="function")throw new TypeError("transport must provide post and get functions");
  const accountId=String(adAccountId||"").trim();if(!/^act_\d{1,30}$/.test(accountId))throw new TypeError("adAccountId must use the act_<digits> format");
  assertPausedOnly(draft);
  const created={}; const reused={};
  if(existing.campaign_id){created.campaign_id=requireId(existing.campaign_id,"campaign id");reused.campaign=true;}
  if(existing.adset_id){created.adset_id=requireId(existing.adset_id,"adset id");reused.adset=true;}
  if(existing.creative_id){created.creative_id=requireId(existing.creative_id,"creative id");reused.creative=true;}
  if(existing.ad_id){created.ad_id=requireId(existing.ad_id,"ad id");reused.ad=true;}
  const plan=buildRecoveryPlan({created}); let stage=plan.resume_from;
  try{
    if(!created.campaign_id){stage="campaign";created.campaign_id=requireId((await transport.post(`/${accountId}/campaigns`,draft.campaign))?.id,"created campaign id");}
    if(!created.adset_id){stage="adset";created.adset_id=requireId((await transport.post(`/${accountId}/adsets`,{...draft.adSet,campaign_id:created.campaign_id}))?.id,"created adset id");}
    if(!created.creative_id){stage="creative";created.creative_id=requireId((await transport.post(`/${accountId}/adcreatives`,draft.creative))?.id,"created creative id");}
    if(!created.ad_id){stage="ad";created.ad_id=requireId((await transport.post(`/${accountId}/ads`,{...draft.ad,adset_id:created.adset_id,creative:{creative_id:created.creative_id}}))?.id,"created ad id");}
    stage="verification";
    let verification=await verifyPaused(transport,created);
    const unsafe=Object.entries(verification).filter(([name,o])=>name!=="creative_id"&&o.status!=="PAUSED");
    for(const [,o] of unsafe) await transport.post(`/${o.id}`,{status:"PAUSED"});
    if(unsafe.length) verification=await verifyPaused(transport,created);
    const stillUnsafe=Object.entries(verification).filter(([name,o])=>name!=="creative_id"&&o.status!=="PAUSED");
    if(stillUnsafe.length) throw new Error("Meta recovery could not verify PAUSED state");
    return {success:true,mode:"paused_draft_only",created,reused,recovery_plan:plan,verification,activates_spend:false};
  }catch(error){throw new PartialMetaDraftError("Paused Meta draft recovery did not complete",created,stage,error,reused);}
}

module.exports={resumePausedReservationDraft,verifyPaused};
