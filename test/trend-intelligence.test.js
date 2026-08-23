const test=require("node:test");
const assert=require("node:assert/strict");
const {pctChange,detectTrendAnomalies,detectTrackingAnomaly}=require("../trend-intelligence");

test("percentage change handles zero baseline safely",()=>{assert.equal(pctChange(10,0),null);assert.equal(pctChange(15,10),0.5);});
test("trend detector flags CPC and conversion deterioration",()=>{const r=detectTrendAnomalies({current:{cpc:0.9,conversions:2,clicks:20,spend:30},baseline:{cpc:0.5,conversions:6,clicks:30,spend:20}});assert.ok(r.anomalies.some(x=>x.code==="CPC_SPIKE"));assert.ok(r.anomalies.some(x=>x.code==="CONVERSION_DROP"));});
test("tracking anomaly detects stale and divergent sources",()=>{const r=detectTrackingAnomaly({googleConversions:4,ga4Bookings:0,googleLastSeenAt:"2026-08-20T00:00:00Z",ga4LastSeenAt:null,now:new Date("2026-08-23T12:00:00Z")});assert.ok(r.some(x=>x.code==="ADS_GA4_TRACKING_DIVERGENCE"));assert.ok(r.some(x=>x.code==="GA4_CONVERSION_DATA_STALE"));});
