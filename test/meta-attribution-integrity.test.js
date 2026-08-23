const test=require("node:test");
const assert=require("node:assert/strict");
const {assessMetaAttributionIntegrity}=require("../meta-attribution-integrity");

test("Meta attribution is healthy when clicks and GA4 sessions align",()=>{
  const r=assessMetaAttributionIntegrity({metaLinkClicks:20,metaLandingPageViews:18,ga4MetaSessions:16,ga4MetaBookings:3});
  assert.equal(r.status,"healthy");
  assert.equal(r.optimization_allowed,true);
});

test("Meta attribution blocks optimization when GA4 signals are missing",()=>{
  const r=assessMetaAttributionIntegrity({metaLinkClicks:20});
  assert.equal(r.status,"unverified");
  assert.equal(r.optimization_allowed,false);
  assert.ok(r.issues.includes("ga4_meta_session_signal_missing"));
});

test("Meta attribution flags severe click-to-session mismatch",()=>{
  const r=assessMetaAttributionIntegrity({metaLinkClicks:30,ga4MetaSessions:8,ga4MetaBookings:1});
  assert.equal(r.status,"degraded");
  assert.equal(r.optimization_allowed,false);
  assert.ok(r.issues.includes("meta_clicks_ga4_sessions_disagree"));
});
