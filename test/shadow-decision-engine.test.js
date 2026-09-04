const test=require("node:test");
const assert=require("node:assert/strict");
const {conversionIntegrity,buildShadowDecisions,assertShadowSafe}=require("../shadow-decision-engine");

test("conversion gate blocks optimization when Ads and GA4 materially disagree",()=>{
  const r=conversionIntegrity({googleConversions:10,ga4GoogleCpcBookings:4,evidence:require('./fixtures/verified-conversion-evidence.json')});
  assert.equal(r.status,"mismatch"); assert.equal(r.safe_for_optimization,false);
});

test("conversion gate accepts values within tolerance",()=>{
  const r=conversionIntegrity({googleConversions:10,ga4GoogleCpcBookings:9,evidence:require('./fixtures/verified-conversion-evidence.json')});
  assert.equal(r.status,"healthy"); assert.equal(r.safe_for_optimization,true);
});

test("shadow engine recommends investigation but performs zero writes",()=>{
  const r=buildShadowDecisions({conversions:{googleConversions:8,ga4GoogleCpcBookings:2},google:{cost:20,bookings:0,baselineBookings:5,booking_semantics_verified:true},meta:{cost:12,bookings:0,baselineBookings:3,booking_semantics_verified:true}});
  assert.equal(r.writes_performed,0); assert.equal(r.spend_changed,false);
  assert.ok(r.decisions.length>=3); assert.doesNotThrow(()=>assertShadowSafe(r));
  r.decisions.forEach(d=>{assert.equal(d.executable,false);assert.equal(d.requires_human_approval,true);});
});

test("empty data remains safe and does not invent performance actions",()=>{
  const r=buildShadowDecisions({});
  assert.equal(r.integrity.status,"insufficient_data");
  assert.equal(r.decisions.length,1);
  assert.equal(r.decisions[0].action,"investigate_tracking");
  assert.doesNotThrow(()=>assertShadowSafe(r));
});

test("safety assertion rejects executable decisions",()=>{
  assert.throws(()=>assertShadowSafe({mode:"shadow",writes_performed:0,spend_changed:false,decisions:[{action:"review",executable:true,requires_human_approval:true}]}),/executable/);
});
