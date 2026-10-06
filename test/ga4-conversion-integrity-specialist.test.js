'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {SIGNAL_POLICY,validateEvidence,readConversionIntegrity}=require('../ga4-conversion-integrity-specialist');

function providerData(){return {access_ok:true,configuration_complete:true,collected_at:'2026-10-06T07:00:00.000Z',total_booking_completed:927,google_cpc_booking_completed:106,booking_quality:{event_count:927,users:795,sessions:863,duplication_risk:false},booking_sources:{google_paid:106},funnel:{completeness:{observation_complete:false}},event_inventory:{top_events:[{event_name:'table_reservation_completed',event_count:11},{event_name:'reservation',event_count:2}],reservation_candidates:[]},candidate_attribution:{totals:{}}};}

test('specialist preserves conversion semantic boundaries',async()=>{
 const result=await readConversionIntegrity({start:'2026-09-06',end:'2026-10-05',now:new Date('2026-10-06T07:00:00Z'),collector:async()=>providerData()});
 assert.equal(result.validated,true);
 const byName=Object.fromEntries(result.evidence.signals.map(x=>[x.event_name,x]));
 assert.equal(byName.booking_completed.event_count,927);
 assert.equal(byName.booking_completed.trust,'UNTRUSTED_AS_RESERVATION');
 assert.equal(byName.table_reservation_completed.trust,'CANDIDATE_SIGNAL_PENDING_WIX_RECONCILIATION');
 assert.equal(byName.reservation.trust,'DIAGNOSTIC_ONLY');
 assert.equal(result.evidence.optimization_allowed,false);
 assert.equal(result.evidence.semantic_boundaries.wix_reservation_equals_revenue,false);
});

test('validation fails closed if a signal is promoted to ground truth',()=>{
 const evidence={schema:'ga4.conversion_integrity.v1',provider_backed:true,signals:Object.entries(SIGNAL_POLICY).map(([event_name,p])=>({event_name,event_count:1,...p})),semantic_boundaries:{wix_reservation_equals_seated_customer:false,wix_reservation_equals_revenue:false},writes_allowed:false,spend_allowed:false,optimization_allowed:false};
 evidence.signals[0].ground_truth=true;
 assert.equal(validateEvidence(evidence).ok,false);
});

test('provider failure remains a failure without leaking raw provider detail',async()=>{
 await assert.rejects(()=>readConversionIntegrity({start:'2026-09-06',end:'2026-10-05',collector:async()=>({access_ok:false,configuration_complete:true,error:'token and URL detail'})}),error=>error.code==='GA4_PROVIDER_READ_FAILED'&&error.message==='ga4_provider_read_unavailable');
});
