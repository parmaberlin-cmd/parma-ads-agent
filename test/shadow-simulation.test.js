const test=require("node:test");
const assert=require("node:assert/strict");
const {runShadowSimulation}=require("../shadow-simulation");

test("simulation combines report trends attribution and access readiness without writes",()=>{
  const r=runShadowSimulation({
    snapshot:{conversions:{googleConversions:10,ga4GoogleCpcBookings:4},google:{cost:20,clicks:10,bookings:0,baselineBookings:4},meta:{cost:10,clicks:5,bookings:0,baselineBookings:2}},
    windows:{last7:{spend:130,bookings:5},last14:{spend:100,bookings:10},last30:{spend:220,bookings:20}},
    access:{googleBasicAccess:false,metaRuntimeAccess:false,ga4RuntimeAccess:true},
    metaAttribution:{metaLinkClicks:30,ga4MetaSessions:8,ga4MetaBookings:1}
  });
  assert.equal(r.mode,"shadow");
  assert.equal(r.writes_allowed,false);
  assert.equal(r.spend_changed,false);
  assert.equal(r.live_validation_blocked,true);
  assert.equal(r.meta_attribution_integrity.status,"degraded");
  assert.ok(r.trend_signals.length>=1);
  assert.ok(r.readiness.mandatory_access_for_live_validation.length>=2);
  assert.ok(r.all_priorities.some(p=>p.action==="investigate_attribution"));
  assert.ok(r.priorities.length<=5);
  r.all_priorities.forEach(p=>assert.equal(p.executable,false));
});

test("simulation clears live validation blocker only with all accesses",()=>{
  const r=runShadowSimulation({access:{googleBasicAccess:true,metaRuntimeAccess:true,ga4RuntimeAccess:true},metaAttribution:{metaLinkClicks:20,ga4MetaSessions:18,ga4MetaBookings:2}});
  assert.equal(r.live_validation_blocked,false);
});
