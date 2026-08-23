function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}

function recommendBudget(rows=[], {maxDeltaPercent=20, minConversions=2}={}) {
  return rows.map(r=>{
    const spend=n(r.spend_eur??r.spend), conversions=n(r.conversions??r.bookings), cpa=conversions?spend/conversions:null;
    let recommendation="keep", delta=0, confidence="low", reason="Insufficient conversion evidence for a budget change.";
    if(conversions>=minConversions){confidence="medium";if(r.target_cpa_eur && cpa<=n(r.target_cpa_eur)*0.8){recommendation="increase";delta=maxDeltaPercent;reason="CPA is materially better than target with sufficient conversion evidence.";}else if(r.target_cpa_eur && cpa>=n(r.target_cpa_eur)*1.3){recommendation="decrease";delta=-maxDeltaPercent;reason="CPA is materially worse than target with sufficient conversion evidence.";}else{reason="Performance is near target; preserve budget while collecting more evidence.";}}
    return {channel:r.channel||"unknown", campaign:r.campaign||null,recommendation,proposed_delta_percent:delta,confidence,reason,requires_authorization:delta!==0,metrics:{spend_eur:spend,conversions,cpa_eur:cpa===null?null:Number(cpa.toFixed(2))}};
  });
}

function assessFunnel({landingAvailable=null,adClicks=null,landingViews=null,reservationStarts=null,bookings=null,conversionIntegrity="unknown",bookingStartedTracked=true}={}){
  const issues=[];
  if(landingAvailable===false) issues.push({code:"LANDING_UNAVAILABLE",severity:"critical"});
  if(conversionIntegrity!=="healthy") issues.push({code:"CONVERSION_INTEGRITY_UNVERIFIED",severity:"high"});
  const clicks=n(adClicks),views=n(landingViews),starts=n(reservationStarts),done=n(bookings);
  if(clicks>=10&&views/clicks<0.7) issues.push({code:"CLICK_TO_LANDING_LEAKAGE",severity:"high"});
  if(bookingStartedTracked===false){
    if(views>=10) issues.push({code:"BOOKING_STARTED_TRACKING_MISSING",severity:"medium"});
  } else {
    if(views>=10&&starts/views<0.1) issues.push({code:"LANDING_TO_RESERVATION_LEAKAGE",severity:"medium"});
    if(starts>=5&&done/starts<0.3) issues.push({code:"RESERVATION_COMPLETION_LEAKAGE",severity:"high"});
  }
  return {status:issues.some(i=>i.severity==="critical")?"blocked":issues.length?"attention_required":"healthy",issues,metrics:{ad_clicks:clicks,landing_views:views,reservation_starts:starts,bookings:done},tracking:{booking_started:bookingStartedTracked!==false}};
}

function buildDailyManager({recommendations=[], anomalies=[], funnel=null, budget=[]}={}){
  const rank={critical:100,high:80,medium:50,low:20};
  const items=[];
  for(const a of anomalies) items.push({source:"anomaly",code:a.code,severity:a.severity||"medium",score:rank[a.severity]||50,reason:a.reason||a.code,requires_authorization:false});
  for(const r of recommendations) items.push({source:"recommendation",code:r.code||r.type,severity:r.priority||"medium",score:n(r.score)||(rank[r.priority]||50),reason:r.reason||"Recommendation",requires_authorization:Boolean(r.requires_authorization)});
  if(funnel) for(const i of funnel.issues||[]) items.push({source:"funnel",code:i.code,severity:i.severity,score:rank[i.severity]||50,reason:i.code,requires_authorization:false});
  for(const b of budget) if(b.proposed_delta_percent!==0) items.push({source:"budget",code:`BUDGET_${String(b.recommendation).toUpperCase()}`,severity:"medium",score:55,reason:b.reason,requires_authorization:true});
  const seen=new Set();
  const deduped=items.sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code)).filter(i=>{const key=`${i.source}:${i.code}`;if(seen.has(key))return false;seen.add(key);return true;});
  return {generated_at:new Date().toISOString(),primary_priorities:deduped.slice(0,3),secondary_observations:deduped.slice(3),authorization_required:deduped.some(i=>i.requires_authorization)};
}

module.exports={recommendBudget,assessFunnel,buildDailyManager};
