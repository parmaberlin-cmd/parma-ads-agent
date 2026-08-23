const test = require("node:test");
const assert = require("node:assert/strict");
const { executePausedMetaDraftSafely } = require("../meta-safe-orchestrator");
const { AUTONOMY_LEVELS } = require("../safe-execution");
const { APPROVAL_TOKEN } = require("../meta-paused-draft");

const validDraft = {
  campaign:{name:"x",status:"PAUSED",objective:"OUTCOME_TRAFFIC",special_ad_categories:[]},
  adSet:{name:"x",status:"PAUSED",lifetime_budget:8400,billing_event:"IMPRESSIONS",optimization_goal:"LINK_CLICKS",targeting:{publisher_platforms:["instagram"],geo_locations:{countries:["DE"]}},dsa_beneficiary:"Parma",dsa_payor:"Parma"},
  creative:{name:"x",object_id:"1",instagram_user_id:"2",source_instagram_media_id:"3"},
  ad:{name:"x",status:"PAUSED"},policy:{may_activate:false},
};

function fakeTransport() { let posts=0; let nextId=100; return { get posts(){return posts;}, async get(endpoint){return {id:endpoint.slice(1),status:"PAUSED",effective_status:"PAUSED"};}, async post(){posts+=1;nextId+=1;return {id:String(nextId)};} }; }

async function run(overrides={}) { const transport=overrides.transport||fakeTransport(); const result=await executePausedMetaDraftSafely({transport,adAccountId:"act_1",draft:validDraft,approvalToken:APPROVAL_TOKEN,writeGateEnabled:true,autonomyLevel:AUTONOMY_LEVELS.SAFE_WRITE,...overrides}); return {transport,result}; }

test("write gate blocks before any transport write",async()=>{const {transport,result}=await run({writeGateEnabled:false});assert.equal(result.blocked,true);assert.equal(transport.posts,0);assert.ok(result.preflight.level_1_readiness.blockers.includes("write_gate_enabled"));});
test("wrong approval token blocks before any transport write",async()=>{const {transport,result}=await run({approvalToken:"wrong"});assert.equal(result.blocked,true);assert.equal(transport.posts,0);assert.ok(result.preflight.level_1_readiness.blockers.includes("approval_token_ok"));});
test("kill switch blocks before any transport write",async()=>{const {transport,result}=await run({killSwitch:true});assert.equal(result.blocked,true);assert.equal(result.reason,"kill_switch_enabled");assert.equal(transport.posts,0);});
test("recommend level cannot write even when preflight is otherwise ready",async()=>{const {transport,result}=await run({autonomyLevel:AUTONOMY_LEVELS.RECOMMEND});assert.equal(result.blocked,true);assert.equal(result.reason,"write_not_allowed_at_level");assert.equal(transport.posts,0);});
test("complete safety context allows only simulated PAUSED object creation",async()=>{const {transport,result}=await run();assert.equal(result.success,true);assert.equal(result.preflight.ready,true);assert.equal(result.activates_spend,false);assert.equal(transport.posts,4);assert.ok(Object.values(result.verification).every(object=>object.status==="PAUSED"));});

test("same operation inputs produce the same deterministic operation key",async()=>{const first=await run({existing:{campaign_id:"10",adset_id:"11",creative_id:"12",ad_id:"13"}});const second=await run({existing:{campaign_id:"10",adset_id:"11",creative_id:"12",ad_id:"13"}});assert.equal(first.result.operation_key,second.result.operation_key);assert.equal(first.transport.posts,0);assert.equal(second.transport.posts,0);});

test("complete existing chain performs verification only and creates no duplicates",async()=>{const {transport,result}=await run({existing:{campaign_id:"10",adset_id:"11",creative_id:"12",ad_id:"13"}});assert.equal(result.success,true);assert.equal(transport.posts,0);assert.equal(result.activates_spend,false);assert.equal(result.reused.campaign,true);assert.equal(result.reused.adset,true);assert.equal(result.reused.creative,true);assert.equal(result.reused.ad,true);});

test("partial chain resumes only from the missing stage",async()=>{const {transport,result}=await run({existing:{campaign_id:"10",adset_id:"11",creative_id:"12"}});assert.equal(result.success,true);assert.equal(transport.posts,1);assert.equal(result.reused.campaign,true);assert.equal(result.reused.adset,true);assert.equal(result.reused.creative,true);assert.equal(Boolean(result.reused.ad),false);});

test("ACTIVE literal anywhere in the draft is rejected before writes",async()=>{const unsafe=structuredClone(validDraft);unsafe.ad.status="ACTIVE";const transport=fakeTransport();const result=await executePausedMetaDraftSafely({transport,adAccountId:"act_1",draft:unsafe,approvalToken:APPROVAL_TOKEN,writeGateEnabled:true,autonomyLevel:AUTONOMY_LEVELS.SAFE_WRITE});assert.equal(result.blocked,true);assert.equal(transport.posts,0);assert.equal(result.preflight.ready,false);});
