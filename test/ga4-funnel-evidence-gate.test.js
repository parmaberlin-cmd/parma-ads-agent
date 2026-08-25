const test=require('node:test');
const assert=require('node:assert/strict');
const {buildFunnelEvidenceGate,funnelRates}=require('../ga4-funnel-intelligence');
const expected=['reservation_page_view','reservation_start','booking_completed'];

test('gate is ready only when every required funnel event is configured and observed',()=>{
 const funnel={event_names:expected,totals:{reservation_page_view:10,reservation_start:4,booking_completed:2}};
 const gate=buildFunnelEvidenceGate(funnel,expected);
 assert.equal(gate.ready,true);
 assert.equal(gate.automation_safe,true);
 assert.deepEqual(gate.blockers,[]);
 assert.equal(gate.writes_allowed,false);
});

test('configured but unobserved events block automation with explicit evidence reasons',()=>{
 const funnel={event_names:expected,totals:{reservation_page_view:0,reservation_start:0,booking_completed:2}};
 const gate=buildFunnelEvidenceGate(funnel,expected);
 assert.equal(gate.ready,false);
 assert.equal(gate.configuration_complete,true);
 assert.equal(gate.observation_complete,false);
 assert.deepEqual(gate.missing_observation,['reservation_page_view','reservation_start']);
 assert.deepEqual(gate.blockers,['event_not_observed:reservation_page_view','event_not_observed:reservation_start']);
 assert.equal(gate.automation_safe,false);
});

test('missing configuration is distinct from missing observation',()=>{
 const funnel={event_names:['booking_completed'],totals:{booking_completed:1}};
 const gate=buildFunnelEvidenceGate(funnel,expected);
 assert.deepEqual(gate.missing_configuration,['reservation_page_view','reservation_start']);
 assert.deepEqual(gate.missing_observation,[]);
});

test('rates remain null when denominators have not been observed',()=>{
 assert.deepEqual(funnelRates({totals:{reservation_page_view:0,reservation_start:0,booking_completed:2}}),{page_to_start:null,start_to_booking:null,page_to_booking:null});
});