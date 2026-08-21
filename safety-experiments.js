function classifyAction(action={}) {
  const type=String(action.type||"");
  const amount=Number(action.amount_eur||action.daily_budget_eur||0);
  const maxBudget=Number(action.max_allowed_budget_eur||20);
  if(["activate_campaign","publish_ad","enable_delivery"].includes(type)) return {decision:"approval_required",reason:"May activate delivery or spend."};
  if(type==="change_budget") return {decision:amount>maxBudget?"blocked":"approval_required",reason:amount>maxBudget?"Budget exceeds guardrail.":"Budget mutation requires approval."};
  if(["read_metrics","analyze","preview","create_paused_draft"].includes(type)) return {decision:"allowed",reason:"Read-only or paused-only operation."};
  return {decision:"blocked",reason:"Unknown action type."};
}

function makeIdempotencyKey({channel,actionType,target,startAt,payloadHash}={}){
  if(!channel||!actionType||!target) throw new Error("channel, actionType and target are required");
  return [channel,actionType,target,startAt||"",payloadHash||""].join(":").toLowerCase();
}

function verifyPostAction({expected={},actual={}}={}){
  const mismatches=[];
  for(const [key,value] of Object.entries(expected)) if(actual[key]!==value) mismatches.push({field:key,expected:value,actual:actual[key]});
  return {verified:mismatches.length===0,mismatches};
}

function designExperiment({name,hypothesis,primaryMetric,variants=[],minimumEvidence={},measurementWindowHours=72}={}){
  if(!name||!hypothesis||!primaryMetric||variants.length<2) throw new Error("name, hypothesis, primaryMetric and at least two variants are required");
  return {name,hypothesis,primary_metric:primaryMetric,variants,minimum_evidence:{min_impressions:minimumEvidence.min_impressions||500,min_conversions:minimumEvidence.min_conversions||2},measurement_window_hours:measurementWindowHours,status:"planned"};
}

function evaluateExperiment(experiment,results=[]){
  if(!experiment) throw new Error("experiment is required");
  const minImp=experiment.minimum_evidence?.min_impressions||0,minConv=experiment.minimum_evidence?.min_conversions||0;
  const eligible=results.filter(r=>Number(r.impressions||0)>=minImp && Number(r.conversions||0)>=minConv);
  if(eligible.length<2) return {status:"insufficient_evidence",winner:null};
  const sorted=[...eligible].sort((a,b)=>Number(b.primary_metric_value||0)-Number(a.primary_metric_value||0));
  return {status:"evaluated",winner:sorted[0].variant_id,runner_up:sorted[1].variant_id};
}

module.exports={classifyAction,makeIdempotencyKey,verifyPostAction,designExperiment,evaluateExperiment};
