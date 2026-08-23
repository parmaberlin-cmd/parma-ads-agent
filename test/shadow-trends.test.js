const test=require("node:test");
const assert=require("node:assert/strict");
const {compareWindows,detectTrendSignals}=require("../shadow-trends");

test("trend comparison preserves 7 14 30 day metrics",()=>{
  const c=compareWindows({last7:{spend:70,clicks:35,bookings:7},last14:{spend:100,clicks:50,bookings:10},last30:{spend:200,clicks:100,bookings:20}});
  assert.equal(c.bookings.ratio_7_to_14,0.7);
  assert.equal(c.spend.ratio_14_to_30,0.5);
});

test("trend signals detect booking weakness",()=>{
  const c=compareWindows({last7:{bookings:5},last14:{bookings:10}});
  assert.ok(detectTrendSignals(c).some(x=>x.code==="BOOKINGS_7D_WEAK"));
});

test("trend signals detect spend growth without booking growth",()=>{
  const c=compareWindows({last7:{spend:130,bookings:10},last14:{spend:100,bookings:10}});
  assert.ok(detectTrendSignals(c).some(x=>x.code==="SPEND_UP_WITHOUT_BOOKING_GROWTH"));
});
