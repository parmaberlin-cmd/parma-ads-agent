const test=require('node:test');
const assert=require('node:assert/strict');
const {buildFinalReadinessAudit,assertAuditSafe}=require('../final-readiness-audit');

function baseSummary(){return{
 writes_allowed:false,
 source_health:{google:true,ga4:true,meta:true},
 source_errors:{google:null,ga4:null,meta:null},
 source_diagnostics:{google:null},
 tracking:{reservation_start:{configured:true,observed:true}},
 data_quality:{integrity_ok:true},
 history:{total_runs:20,storage:{durable:true,source:'railway_volume'}},
 promotion:{promotion_ready:false,blockers:[]},
};}

test('fully healthy software can be read-only ready while promotion remains separately gated',()=>{
 const audit=buildFinalReadinessAudit({summary:baseSummary(),metaPreflight:{read_only_ready:true,write_ready:false},now:new Date('2026-08-23T12:00:00Z')});
 assert.equal(audit.software_complete,true);
 assert.equal(audit.autonomous_read_only_ready,true);
 assert.deepEqual(audit.blockers.software,[]);
 assert.equal(assertAuditSafe(audit),true);
});

test('Google invalid developer token is classified external, not as a software defect',()=>{
 const summary=baseSummary();summary.source_health.google=false;summary.source_diagnostics.google={category:'developer_token',reason:'developer_token_invalid'};
 const audit=buildFinalReadinessAudit({summary,metaPreflight:{read_only_ready:true,write_ready:false}});
 assert.equal(audit.software_complete,true);
 assert.ok(audit.blockers.external.some(x=>x.blocker==='google_live_access'&&x.detail==='developer_token_invalid'));
});

test('configured but unobserved reservation_start is an evidence/time blocker',()=>{
 const summary=baseSummary();summary.tracking.reservation_start={configured:true,observed:false};
 const audit=buildFinalReadinessAudit({summary,metaPreflight:{read_only_ready:true,write_ready:false}});
 assert.equal(audit.software_complete,true);
 assert.ok(audit.blockers.time_based.some(x=>x.blocker==='ga4_reservation_start_not_observed'));
});

test('unconfigured reservation_start remains a software blocker',()=>{
 const summary=baseSummary();summary.tracking.reservation_start={configured:false,observed:false};
 const audit=buildFinalReadinessAudit({summary,metaPreflight:{read_only_ready:true,write_ready:false}});
 assert.equal(audit.software_complete,false);
 assert.ok(audit.blockers.software.some(x=>x.blocker==='ga4_reservation_start_not_configured'));
});

test('ephemeral history is external infrastructure and insufficient runs are time-based',()=>{
 const summary=baseSummary();summary.history={total_runs:3,storage:{durable:false,source:'default_tmp'}};
 const audit=buildFinalReadinessAudit({summary,metaPreflight:{read_only_ready:true,write_ready:false}});
 assert.ok(audit.blockers.external.some(x=>x.blocker==='shadow_history_not_durable'));
 assert.ok(audit.blockers.time_based.some(x=>x.blocker==='insufficient_shadow_runs'));
});

test('unexpected Meta write readiness is a software/safety blocker',()=>{
 const audit=buildFinalReadinessAudit({summary:baseSummary(),metaPreflight:{read_only_ready:true,write_ready:true}});
 assert.equal(audit.software_complete,false);
 assert.ok(audit.blockers.software.some(x=>x.blocker==='meta_write_gate_unexpectedly_ready'));
 assert.equal(audit.writes_allowed,false);
});