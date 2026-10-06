'use strict';

const { collectGa4ShadowData } = require('./ga4-shadow-data');

const SCHEMA = 'ga4.conversion_integrity.v1';
const SIGNAL_POLICY = Object.freeze({
  booking_completed: Object.freeze({ trust:'UNTRUSTED_AS_RESERVATION', semantic_role:'diagnostic_event', ground_truth:false }),
  table_reservation_completed: Object.freeze({ trust:'CANDIDATE_SIGNAL_PENDING_WIX_RECONCILIATION', semantic_role:'reservation_candidate', ground_truth:false }),
  reservation: Object.freeze({ trust:'DIAGNOSTIC_ONLY', semantic_role:'diagnostic_event', ground_truth:false }),
});

function isoDate(value,label){
  const text=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(Date.parse(`${text}T00:00:00Z`)))throw new TypeError(`${label}_must_be_YYYY_MM_DD`);
  return text;
}
function countFor(data,name){
  if(name==='booking_completed')return Number(data.total_booking_completed||0);
  const events=[...(data.event_inventory?.top_events||[]),...(data.event_inventory?.reservation_candidates||[])];
  const row=events.find(x=>String(x.event_name||'')===name);
  return Number(row?.event_count||data.candidate_attribution?.totals?.[name]||0);
}
function validateEvidence(evidence){
  const errors=[];
  if(evidence.schema!==SCHEMA)errors.push('schema_mismatch');
  if(evidence.provider_backed!==true)errors.push('provider_evidence_missing');
  if(evidence.writes_allowed!==false||evidence.spend_allowed!==false||evidence.optimization_allowed!==false)errors.push('read_only_invariant_failed');
  const byName=new Map((evidence.signals||[]).map(x=>[x.event_name,x]));
  for(const [name,policy] of Object.entries(SIGNAL_POLICY)){
    const signal=byName.get(name);
    if(!signal||signal.trust!==policy.trust||signal.ground_truth!==false)errors.push(`signal_policy_mismatch:${name}`);
    if(signal&&(!Number.isFinite(signal.event_count)||signal.event_count<0))errors.push(`invalid_event_count:${name}`);
  }
  if(evidence.semantic_boundaries?.wix_reservation_equals_seated_customer!==false||evidence.semantic_boundaries?.wix_reservation_equals_revenue!==false)errors.push('wix_semantic_boundary_failed');
  if(/"(?:access_token|refresh_token|client_secret|api_key)"\s*:/i.test(JSON.stringify(evidence)))errors.push('secret_shaped_field');
  return {ok:errors.length===0,errors};
}
async function readConversionIntegrity({env=process.env,start,end,now=new Date(),collector=collectGa4ShadowData}={}){
  start=isoDate(start,'start');end=isoDate(end,'end');
  if(Date.parse(start)>Date.parse(end))throw new TypeError('start_must_not_follow_end');
  const data=await collector({env,startDate:start,endDate:end,now});
  if(data?.access_ok!==true){const error=new Error('ga4_provider_read_unavailable');error.code=data?.configuration_complete===false?'GA4_CONFIGURATION_INCOMPLETE':'GA4_PROVIDER_READ_FAILED';throw error;}
  const signals=Object.entries(SIGNAL_POLICY).map(([event_name,policy])=>({event_name,event_count:countFor(data,event_name),...policy}));
  const evidence={schema:SCHEMA,period:{start,end},retrieved_at:data.collected_at||now.toISOString(),provider:'Google Analytics Data API',provider_backed:true,signals,source_breakdown:{booking_completed:data.booking_sources||null,google_cpc_booking_completed:Number(data.google_cpc_booking_completed||0)},quality:{booking_completed:data.booking_quality||null,funnel_completeness:data.funnel?.completeness||null},semantic_boundaries:{ga4_event_equals_reservation:false,wix_reservation_equals_seated_customer:false,wix_reservation_equals_revenue:false,revenue_available:false},writes_allowed:false,spend_allowed:false,optimization_allowed:false};
  const validation=validateEvidence(evidence);evidence.validation=validation;
  return {validated:validation.ok,correctable:false,evidence};
}

module.exports={SCHEMA,SIGNAL_POLICY,countFor,validateEvidence,readConversionIntegrity};
