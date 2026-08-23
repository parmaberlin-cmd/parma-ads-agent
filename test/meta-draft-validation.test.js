const test = require("node:test");
const assert = require("node:assert/strict");
const { validateDraft, classifyMetaError, buildRecoveryPlan } = require("../meta-draft-validation");

test("rejects any non-paused draft shape", () => {
  const result = validateDraft({campaign:{status:"ACTIVE"},adSet:{status:"PAUSED",targeting:{publisher_platforms:["instagram"]}},creative:{object_id:"1",instagram_user_id:"2",source_instagram_media_id:"3"},ad:{status:"PAUSED"},policy:{may_activate:false}});
  assert.equal(result.valid,false);
  assert.ok(result.problems.includes("campaign_status"));
});

test("classifies known Meta invalid parameter failures", () => {
  const result=classifyMetaError({response:{data:{error:{message:"Invalid parameter",type:"OAuthException",code:100,error_subcode:1870227}}}});
  assert.equal(result.invalid_parameter,true);
  assert.equal(result.subcode,1870227);
});

test("recovery resumes after existing campaign instead of duplicating it", () => {
  const plan=buildRecoveryPlan({created:{campaign_id:"123"}});
  assert.equal(plan.reuse_campaign,true);
  assert.equal(plan.resume_from,"adset");
});

test("recovery resumes at ad when campaign adset and creative exist", () => {
  const plan=buildRecoveryPlan({created:{campaign_id:"1",adset_id:"2",creative_id:"3"}});
  assert.equal(plan.resume_from,"ad");
});
