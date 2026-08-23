const test=require("node:test");
const assert=require("node:assert/strict");
const {evaluateOutcome,updateRecommendationReliability,buildLearningDecision,runAdversarialChecks,buildReleaseCandidateStatus}=require("../agent-learning");
const {buildShadowAgentReport}=require("../agent-shadow");

test("learning loop compares predicted and actual direction",()=>{const r=evaluateOutcome({prediction:{metric:"bookings",expected_direction:"up",confidence:"medium"},before:{metric_value:2},after:{metric_value:4}});assert.equal(r.matched,true);assert.equal(r.delta,2);});
test("recommendation reliability is grouped by type",()=>{const r=updateRecommendationReliability([{type:"keyword",matched:true},{type:"keyword",matched:false},{type:"keyword",matched:true}]);assert.equal(r.keyword.reliability,0.667);});
test("learning weight stays bounded on weak evidence",()=>{assert.equal(buildLearningDecision({type:"keyword",reliability:1,evidenceCount:1}).weight,0.5);assert.equal(buildLearningDecision({type:"keyword",reliability:0.8,evidenceCount:5}).weight,1);});
test("adversarial scenarios all fail closed",()=>{const r=runAdversarialChecks(buildShadowAgentReport);assert.equal(r.length,4);assert.ok(r.every(x=>x.passed));});
test("release candidate can be code-ready while Google live remains blocker",()=>{const r=buildReleaseCandidateStatus({testsPassed:true,syntaxPassed:true,adversarial:[{passed:true}],liveGoogleValidated:false});assert.equal(r.pre_basic_access_ready,true);assert.equal(r.release_status,"ready_for_live_google_validation");assert.ok(r.blockers.includes("google_ads_live_validation"));});
