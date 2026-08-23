const { buildMetaOneShotExecutionPlan }=require('./meta-execution-plan');
const { inspectKnownPartial }=require('./meta-partial-inspection');

async function prepareMetaPausedOneShot({transport,...input}={}){
 const known=input.knownPartial||{};
 const hasKnown=Boolean(known.campaign_id||known.adset_id||known.creative_id||known.ad_id);
 const inspection=hasKnown?await inspectKnownPartial({transport,knownPartial:known}):{consistent:true,blockers:[],safe_to_reuse:{}};
 const plan=buildMetaOneShotExecutionPlan(input);
 const blockers=[...plan.preflight.level_1_readiness.blockers,...plan.preflight.level_2_payload.blockers,...(inspection.blockers||[])];
 return {
  ready:plan.executable&&inspection.consistent&&blockers.length===0,
  preflight:plan.preflight,
  partial_inspection:inspection,
  execution_order:plan.order,
  maximum_attempts:1,
  may_activate:false,
  may_create_duplicate:false,
  blockers:[...new Set(blockers)],
 };
}
module.exports={prepareMetaPausedOneShot};
