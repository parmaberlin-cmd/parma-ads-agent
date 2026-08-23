const test=require("node:test");
const assert=require("node:assert/strict");
const {redact,stagePayloads,diagnoseStageFailure}=require("../meta-stage-diagnostics");

test("redaction removes credential-like fields recursively",()=>{
  const out=redact({access_token:"abc",nested:{client_secret:"def"},safe:"ok"});
  assert.equal(out.access_token,"[REDACTED]");
  assert.equal(out.nested.client_secret,"[REDACTED]");
  assert.equal(out.safe,"ok");
});

test("stage payload exposes only the failing request shape",()=>{
  const draft={campaign:{status:"PAUSED"},adSet:{status:"PAUSED",targeting:{publisher_platforms:["instagram"]}},creative:{object_id:"1",instagram_user_id:"2",source_instagram_media_id:"3"},ad:{status:"PAUSED"},policy:{may_activate:false}};
  const p=stagePayloads("act_123",draft,{campaign_id:"10"});
  assert.equal(p.adset.payload.campaign_id,"10");
  const error={stage:"adset",created:{campaign_id:"10"},response:{data:{error:{message:"Invalid parameter",code:100,error_subcode:3858081}}}};
  const d=diagnoseStageFailure({error,draft,accountId:"act_123"});
  assert.equal(d.stage,"adset");
  assert.equal(d.meta_error.subcode,3858081);
  assert.equal(d.credentials_exposed,false);
});
