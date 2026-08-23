const test=require("node:test");
const assert=require("node:assert/strict");
const {assessMetaPausedLiveTestReadiness}=require("../meta-live-test-readiness");

const goodDraft={campaign:{status:"PAUSED"},adSet:{status:"PAUSED",targeting:{publisher_platforms:["instagram"]}},creative:{object_id:"1",instagram_user_id:"2",source_instagram_media_id:"3"},ad:{status:"PAUSED"},policy:{may_activate:false}};

test("live PAUSED test remains blocked until every gate is satisfied",()=>{
 const result=assessMetaPausedLiveTestReadiness({draft:goodDraft,assets:{page_id:"1",instagram_user_id:"2",source_instagram_media_id:"3"},writeGateEnabled:false,approvalTokenOk:true});
 assert.equal(result.ready,false);
 assert.ok(result.blockers.includes("write_gate_enabled"));
 assert.equal(result.maximum_attempts,1);
});

test("ready state still cannot activate delivery",()=>{
 const result=assessMetaPausedLiveTestReadiness({draft:goodDraft,assets:{page_id:"1",instagram_user_id:"2",source_instagram_media_id:"3"},writeGateEnabled:true,approvalTokenOk:true});
 assert.equal(result.ready,true);
 assert.equal(result.creates_active_delivery,false);
});

test("known partial objects force recovery mode",()=>{
 const result=assessMetaPausedLiveTestReadiness({draft:goodDraft,assets:{page_id:"1",instagram_user_id:"2",source_instagram_media_id:"3"},writeGateEnabled:true,approvalTokenOk:true,knownPartial:{campaign_id:"9"}});
 assert.equal(result.recovery_mode,true);
});
