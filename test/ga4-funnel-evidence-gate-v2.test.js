const test=require('node:test');
const assert=require('node:assert/strict');
const {buildFunnelEvidenceGate}=require('../ga4-funnel-intelligence');
const expected=['reservation_page_view','reservation_start','booking_completed'];

test('all required events must be configured and observed',()=>{
 const ready=buildFunnelEvidenceGate({event_names:expected,totals:{reservation_page_view:10,reservation_start:4,booking_completed:2}},expected);
 assert.equal(ready.ready,true);assert.equal(ready.automation_safe,true);assert.equal(ready.writes_allowed,false);
});

test('configured but unobserved events remain explicit blockers',()=>{
 const gate=buildFunnelEvidenceGate({event_names:expected,totals:{reservation_page_view:0,reservation_start:0,booking_completed:2}},expected);
 assert.equal(gate.ready,false);assert.deepEqual(gate.missing_observation,['reservation_page_view','reservation_start']);assert.ok(gate.blockers.includes('event_not_observed:reservation_start'));assert.equal(gate.automation_safe,false);
});

test('missing configuration is distinct from missing observation',()=>{
 const gate=buildFunnelEvidenceGate({event_names:['booking_completed'],totals:{booking_completed:1}},expected);
 assert.deepEqual(gate.missing_configuration,['reservation_page_view','reservation_start']);assert.deepEqual(gate.missing_observation,[]);
});