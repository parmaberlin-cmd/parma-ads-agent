const test=require("node:test");
const assert=require("node:assert/strict");
const {summarizeChannel,buildDailyShadowReport}=require("../daily-shadow-report");

test("channel summary calculates CPC and cost per booking",()=>{
  assert.deepEqual(summarizeChannel({cost:24,clicks:12,bookings:3}),{spend_eur:24,clicks:12,bookings:3,cpc_eur:2,cost_per_booking_eur:8});
});

test("daily report preserves zero-write contract and journal",()=>{
  const report=buildDailyShadowReport({
    source_health:{google:true,ga4:true,meta:true},
    conversions:{googleConversions:10,ga4GoogleCpcBookings:4},
    google:{cost:20,clicks:10,bookings:0,baselineBookings:4},
    meta:{cost:12,clicks:6,bookings:0,baselineBookings:2}
  });
  assert.equal(report.mode,"shadow");
  assert.equal(report.writes_allowed,false);
  assert.equal(report.spend_changed,false);
  assert.ok(report.top_priorities.length>0);
  assert.ok(report.journal.length>0);
  report.journal.forEach(entry=>{
    assert.equal(entry.executable,false);
    assert.equal(entry.execution_status,"not_executed");
    assert.equal(entry.requires_human_approval,true);
  });
});

test("daily report does not invent cost-per-booking without bookings",()=>{
  const report=buildDailyShadowReport({conversions:{googleConversions:0,ga4GoogleCpcBookings:0},google:{cost:15,clicks:5,bookings:0}});
  assert.equal(report.channels.google.cost_per_booking_eur,null);
  assert.equal(report.channels.google.cpc_eur,3);
});
