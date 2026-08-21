function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}

function estimateBusinessValue({spendEur=0,bookings=0,avgPartySize=2,avgSpendPerGuestEur=24,grossMarginRatio=null}={}){
  const revenue=n(bookings)*n(avgPartySize)*n(avgSpendPerGuestEur);const spend=n(spendEur);const roas=spend>0?revenue/spend:null;const contribution=grossMarginRatio===null?null:revenue*n(grossMarginRatio)-spend;
  return {spend_eur:spend,bookings:n(bookings),estimated_revenue_eur:Number(revenue.toFixed(2)),estimated_roas:roas===null?null:Number(roas.toFixed(2)),estimated_contribution_after_ads_eur:contribution===null?null:Number(contribution.toFixed(2))};
}

function allocateChannelRoles({google={},meta={}}={}){
  const recommendations=[];
  if(n(google.intent_conversions)>0) recommendations.push({channel:"google",role:"capture_existing_demand",priority:"high",reason:"Google is producing intent-linked conversions."});
  else if(n(google.clicks)>0) recommendations.push({channel:"google",role:"validate_conversion_path",priority:"high",reason:"Google traffic exists but conversion evidence is weak."});
  if(n(meta.reach)>0 && n(meta.bookings)>0) recommendations.push({channel:"meta",role:"generate_and_convert_demand",priority:"high",reason:"Meta shows both reach and booking evidence."});
  else if(n(meta.reach)>0) recommendations.push({channel:"meta",role:"generate_demand_and_test_creative",priority:"medium",reason:"Meta creates reach but booking evidence is not yet established."});
  return recommendations;
}

function diagnoseRecovery({googleError=null,metaError=null,railwayError=null}={}){
  const actions=[];
  if(googleError) actions.push({system:"google",category:/oauth|invalid_grant|token/i.test(String(googleError))?"auth":"api",safe_action:"run_read_only_connection_test",requires_human:false});
  if(metaError) actions.push({system:"meta",category:/permission|oauth|token/i.test(String(metaError))?"auth_or_permission":"api",safe_action:"run_read_only_asset_and_permission_diagnostics",requires_human:false});
  if(railwayError) actions.push({system:"railway",category:/viewer|role|permission/i.test(String(railwayError))?"permission":"runtime",safe_action:/viewer|role|permission/i.test(String(railwayError))?"request_required_role":"inspect_status_and_logs",requires_human:/viewer|role|permission/i.test(String(railwayError))});
  return actions;
}

function scheduleChecks({now=new Date(),lastRuns={}}={}){
  const rules={anomaly_minutes:60,performance_hours:24,search_terms_hours:72,creative_hours:24,conversion_integrity_hours:24};
  const due=[];
  function elapsed(key,ms){if(!lastRuns[key])return true;const t=new Date(lastRuns[key]);return Number.isNaN(t.getTime())||now.getTime()-t.getTime()>=ms;}
  if(elapsed("anomaly",rules.anomaly_minutes*60000))due.push("anomaly");
  if(elapsed("performance",rules.performance_hours*3600000))due.push("performance");
  if(elapsed("search_terms",rules.search_terms_hours*3600000))due.push("search_terms");
  if(elapsed("creative",rules.creative_hours*3600000))due.push("creative");
  if(elapsed("conversion_integrity",rules.conversion_integrity_hours*3600000))due.push("conversion_integrity");
  return {rules,due};
}

function evaluateAgentDecision({scenario,decision}={}){
  if(!scenario||!decision)throw new Error("scenario and decision are required");
  const expected=scenario.expected_action;const forbidden=scenario.forbidden_actions||[];const failures=[];
  if(expected&&decision.action!==expected)failures.push("expected_action_mismatch");
  if(forbidden.includes(decision.action))failures.push("forbidden_action_selected");
  if(scenario.requires_conversion_integrity&&decision.conversion_integrity!=="healthy"&&decision.action==="increase_budget")failures.push("optimized_on_untrusted_conversions");
  if(scenario.landing_available===false&&["increase_budget","expand_targeting"].includes(decision.action))failures.push("ignored_broken_landing");
  return {passed:failures.length===0,failures};
}

module.exports={estimateBusinessValue,allocateChannelRoles,diagnoseRecovery,scheduleChecks,evaluateAgentDecision};
