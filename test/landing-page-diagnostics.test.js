const test=require("node:test");
const assert=require("node:assert/strict");
const {diagnoseLanding}=require("../landing-page-diagnostics");

test("landing diagnostics flags click loss and slow web vitals",()=>{
  const r=diagnoseLanding({adClicks:20,landingViews:10,bookingStarts:2,bookings:1,lcpMs:3200,inpMs:250,cls:0.2});
  assert.equal(r.requires_write,false);
  assert.ok(r.issues.some(x=>x.code==="LANDING_VIEW_LOSS"));
  assert.ok(r.issues.some(x=>x.code==="LCP_SLOW"));
  assert.ok(r.issues.some(x=>x.code==="INP_SLOW"));
  assert.ok(r.issues.some(x=>x.code==="CLS_HIGH"));
});

test("landing diagnostics does not invent booking-start leakage when event is unavailable",()=>{
  const r=diagnoseLanding({adClicks:20,landingViews:18,bookingStarts:null,bookings:3});
  assert.equal(r.metrics.booking_starts,null);
  assert.equal(r.issues.some(x=>x.code==="BOOKING_START_RATE_LOW"),false);
  assert.equal(r.issues.some(x=>x.code==="BOOKING_COMPLETION_RATE_LOW"),false);
});

test("healthy funnel returns healthy status",()=>{
  const r=diagnoseLanding({adClicks:20,landingViews:18,bookingStarts:8,bookings:4,lcpMs:1800,inpMs:120,cls:0.05});
  assert.equal(r.status,"healthy");
  assert.deepEqual(r.issues,[]);
});
