const test=require("node:test");
const assert=require("node:assert/strict");
const {assessExternalAccessReadiness,liveValidationBlocked}=require("../access-readiness");

test("missing Google and Meta access is reported without blocking offline work",()=>{
  const r=assessExternalAccessReadiness({ga4RuntimeAccess:true});
  assert.equal(r.can_continue_offline,true);
  assert.equal(r.external_validation_complete,false);
  assert.ok(r.mandatory_access_for_live_validation.some(x=>x.code==="GOOGLE_BASIC_ACCESS_REQUIRED"));
  assert.ok(r.mandatory_access_for_live_validation.some(x=>x.code==="META_RUNTIME_ACCESS_REQUIRED"));
  assert.equal(liveValidationBlocked(r),true);
});

test("all external accesses clear live-validation blockers",()=>{
  const r=assessExternalAccessReadiness({googleBasicAccess:true,metaRuntimeAccess:true,ga4RuntimeAccess:true});
  assert.equal(r.external_validation_complete,true);
  assert.deepEqual(r.mandatory_access_for_live_validation,[]);
  assert.equal(liveValidationBlocked(r),false);
});
